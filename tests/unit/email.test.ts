import { describe, it, expect, vi } from 'vitest';
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendMagicLinkEmail,
  FROM_ADDRESS,
  FROM_NAME,
  REPLY_TO,
  type SendEmailBinding,
} from '../../src/worker/lib/email';

function makeMockBinding() {
  const send = vi.fn(async () => undefined);
  return { send } as SendEmailBinding & { send: ReturnType<typeof vi.fn> };
}

describe('sendVerificationEmail', () => {
  it('calls binding.send exactly once with expected shape', async () => {
    const b = makeMockBinding();
    await sendVerificationEmail(b, {
      to: 'alice@example.com', token: 'tok-123', appUrl: 'https://heritage.jairukchan.com',
    });
    expect(b.send).toHaveBeenCalledTimes(1);
    const [msg] = b.send.mock.calls[0];
    expect(msg.to).toBe('alice@example.com');
    expect(msg.from).toEqual({ email: FROM_ADDRESS, name: FROM_NAME });
    expect(msg.subject).toMatch(/ยืนยัน/);
    expect(msg.subject).toMatch(/verify/i);
    expect(msg.text).toBeTruthy();
    expect(msg.html).toBeTruthy();
  });

  it('embeds URL-encoded token in verification URL', async () => {
    const b = makeMockBinding();
    await sendVerificationEmail(b, {
      to: 't@x.com', token: 'abc+def/ghi', appUrl: 'https://a.com',
    });
    const [msg] = b.send.mock.calls[0];
    const expected = 'https://a.com/auth/verify?token=' + encodeURIComponent('abc+def/ghi');
    expect(msg.text).toContain(expected);
    expect(msg.html).toContain(expected);
  });

  it('includes both Thai and English content', async () => {
    const b = makeMockBinding();
    await sendVerificationEmail(b, { to: 'x@y.com', token: 't', appUrl: 'https://a.com' });
    const [msg] = b.send.mock.calls[0];
    expect(msg.text).toMatch(/สวัสดี/);
    expect(msg.text?.toLowerCase()).toMatch(/verify|email/);
    expect(msg.html).toMatch(/สวัสดี/);
  });

  it('never contains the raw token outside the URL query string', async () => {
    // Defence: we never want the token logged or displayed as plaintext anywhere but
    // the link so attackers can't harvest from screenshots.
    const b = makeMockBinding();
    const token = 'super-sensitive-token-XYZ';
    await sendVerificationEmail(b, { to: 'x@y.com', token, appUrl: 'https://a.com' });
    const [msg] = b.send.mock.calls[0];
    const occurrencesInText = (msg.text ?? '').split(encodeURIComponent(token)).length - 1;
    // Must appear exactly once (inside the URL)
    expect(occurrencesInText).toBe(1);
  });
});

describe('sendPasswordResetEmail', () => {
  it('uses /auth/reset/confirm path and 1h language', async () => {
    const b = makeMockBinding();
    await sendPasswordResetEmail(b, { to: 'r@x.com', token: 't', appUrl: 'https://a.com' });
    const [msg] = b.send.mock.calls[0];
    expect(msg.text).toContain('https://a.com/auth/reset/confirm?token=t');
    // Expire wording
    expect(msg.text).toMatch(/1 ชั่วโมง|1 hour/);
  });
});

// ---------------------------------------------------------------------------
// M5 regression + new tests
// ---------------------------------------------------------------------------

describe('M5-T0: sender regression — all existing emails use heritage@ + replyTo', () => {
  it('sendVerificationEmail uses heritage@ sender and has replyTo', async () => {
    const b = makeMockBinding();
    await sendVerificationEmail(b, { to: 'a@b.com', token: 'tok', appUrl: 'https://a.com' });
    const [msg] = b.send.mock.calls[0];
    expect((msg.from as { email: string }).email).toBe('heritage@jairukchan.com');
    expect(msg.replyTo).toBe('heritage@jairukchan.com');
  });

  it('sendPasswordResetEmail uses heritage@ sender and has replyTo', async () => {
    const b = makeMockBinding();
    await sendPasswordResetEmail(b, { to: 'a@b.com', token: 'tok', appUrl: 'https://a.com' });
    const [msg] = b.send.mock.calls[0];
    expect((msg.from as { email: string }).email).toBe('heritage@jairukchan.com');
    expect(msg.replyTo).toBe('heritage@jairukchan.com');
  });
});

describe('M5-T1: sendMagicLinkEmail — basic shape', () => {
  it('calls send once with correct to, from, subject, and link', async () => {
    const b = makeMockBinding();
    const to = 'user@example.com';
    const token = 'abc123';
    const appUrl = 'https://heritage.jairukchan.com';
    await sendMagicLinkEmail(b, { to, token, appUrl });
    expect(b.send).toHaveBeenCalledTimes(1);
    const [msg] = b.send.mock.calls[0];
    expect(msg.to).toBe(to);
    expect((msg.from as { email: string }).email).toBe('heritage@jairukchan.com');
    expect((msg.from as { email: string; name?: string }).name).toBe('Heritage');
    // Subject must have both Thai and English phrasing
    expect(msg.subject).toMatch(/ลิงก์|magic/i);
    expect(msg.subject).toMatch(/เข้าสู่ระบบ|sign.?in/i);
    // Link in text and html
    const link = `${appUrl}/auth/magic?token=${encodeURIComponent(token)}`;
    expect(msg.text).toContain(link);
    expect(msg.html).toContain(encodeURIComponent(token));
    // replyTo
    expect(msg.replyTo).toBe('heritage@jairukchan.com');
  });
});

describe('M5-T2: sendMagicLinkEmail — special chars are percent-encoded', () => {
  it('encodes + / = in token in both text and html', async () => {
    const b = makeMockBinding();
    const token = 'abc+def/ghi=jkl';
    const appUrl = 'https://a.com';
    await sendMagicLinkEmail(b, { to: 'u@x.com', token, appUrl });
    const [msg] = b.send.mock.calls[0];
    const encoded = encodeURIComponent(token);
    expect(msg.text).toContain(`${appUrl}/auth/magic?token=${encoded}`);
    expect(msg.html).toContain(encoded);
    // Raw special chars must NOT appear literally in the link
    expect(msg.text).not.toContain(`token=${token}`);
    expect(msg.html).not.toContain(`token=${token}`);
  });
});

describe('M5-T3: sendMagicLinkEmail — no XSS via token', () => {
  it('script tag in token is percent-encoded, never rendered raw in HTML', async () => {
    const b = makeMockBinding();
    const token = '"><script>alert(1)</script>';
    await sendMagicLinkEmail(b, { to: 'u@x.com', token, appUrl: 'https://a.com' });
    const [msg] = b.send.mock.calls[0];
    // The literal <script> must not appear in HTML output
    expect(msg.html).not.toContain('<script>');
    // The token must appear encoded (the percent-encoded version should be present)
    expect(msg.html).toContain(encodeURIComponent(token));
  });
});
