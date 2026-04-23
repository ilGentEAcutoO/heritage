import { describe, it, expect, vi } from 'vitest';
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  FROM_ADDRESS,
  FROM_NAME,
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
