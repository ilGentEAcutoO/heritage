import { describe, it, expect } from 'vitest';
import { sendShareInvitationEmail, escapeHtml } from '../../src/worker/lib/email';

describe('escapeHtml', () => {
  it('escapes all HTML metacharacters', () => {
    expect(escapeHtml('<script>"&\'')).toBe('&lt;script&gt;&quot;&amp;&#39;');
  });
  it('is a no-op for plain text', () => {
    expect(escapeHtml('บ้านวงศ์สุริยา 123')).toBe('บ้านวงศ์สุริยา 123');
  });
});

describe('sendShareInvitationEmail — HTML-injection safety', () => {
  it('escapes a malicious tree name and inviter name in the HTML body', async () => {
    let sent: { html?: string; subject?: string } | null = null;
    const binding = {
      send: async (m: { html?: string; subject?: string }) => {
        sent = m;
      },
    };

    await sendShareInvitationEmail(binding, {
      to: 'victim@example.com',
      treeName: '<script>alert(1)</script>',
      inviterName: '<img src=x onerror=alert(2)>',
      treeSlug: 'demo',
      appUrl: 'https://heritage.jairukchan.com',
    });

    expect(sent).not.toBeNull();
    const html = sent!.html ?? '';
    // Raw injection payloads must NOT appear unescaped in the HTML body.
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x onerror');
    // …they must appear escaped instead.
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror');
  });
});
