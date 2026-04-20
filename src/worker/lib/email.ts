/**
 * CF Email Service wrapper — sends magic-link emails via the `send_email`
 * binding (configured with `remote: true` in wrangler.jsonc).
 *
 * In local dev we set `EMAIL_DEV_STUB=1` which short-circuits to console.log;
 * this lets us iterate the auth flow without having Workers Paid or a
 * verified sending domain.
 *
 * The actual binding call builds a fully-formed RFC 5322 message and hands
 * it to the Email Service, matching the reference pattern at
 * https://developers.cloudflare.com/email-service/examples/email-sending/magic-link/
 */
import type { Env } from '../types';

function buildHtml(magicUrl: string): string {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const safeUrl = magicUrl; // URLs go into href only; no HTML injection surface
  return `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><title>Heritage — Magic Link</title></head>
  <body style="font-family: -apple-system, Segoe UI, sans-serif; color: #222; padding: 24px; max-width: 560px; margin: auto;">
    <h2 style="margin-top:0">เข้าสู่ระบบ Heritage</h2>
    <p>สวัสดีค่ะ / Hello,</p>
    <p>คลิกที่ลิงก์ด้านล่างเพื่อเข้าสู่ระบบ<br/>Click the link below to sign in:</p>
    <p style="margin: 24px 0">
      <a href="${safeUrl}" style="background:#2a6; color:#fff; padding:12px 20px; border-radius:8px; text-decoration:none; display:inline-block">เข้าสู่ระบบ / Sign in</a>
    </p>
    <p style="color:#666; font-size:14px">
      หรือคัดลอกลิงก์นี้ไปวางในเบราว์เซอร์ / Or paste this URL into your browser:<br/>
      <code style="word-break:break-all">${safeUrl}</code>
    </p>
    <hr style="border:none; border-top:1px solid #eee; margin:24px 0"/>
    <p style="color:#888; font-size:13px">
      ลิงก์นี้ใช้ได้ภายใน 15 นาที และใช้ได้เพียงครั้งเดียว<br/>
      Link expires in 15 minutes and can only be used once.
    </p>
    <p style="color:#888; font-size:13px">หากคุณไม่ได้ร้องขอ กรุณาเพิกเฉยอีเมลนี้ / If you did not request this, please ignore this email.</p>
  </body>
</html>`;
}

function buildText(magicUrl: string): string {
  return `เข้าสู่ระบบ Heritage / Sign in to Heritage

คลิกลิงก์นี้ / Click this link:
${magicUrl}

ลิงก์นี้ใช้ได้ภายใน 15 นาที และใช้ได้เพียงครั้งเดียว
Link expires in 15 minutes and can only be used once.

หากคุณไม่ได้ร้องขอ กรุณาเพิกเฉย / If you did not request this, ignore this email.
`;
}

/**
 * Send a magic-link email.
 *
 * Dev-stub mode: if `env.EMAIL_DEV_STUB === '1'` we print to console and return;
 * this is the default in `.dev.vars` so local flow never tries to hit the
 * real Email Service (which requires Workers Paid + a verified domain).
 *
 * Production path uses the `send_email` binding's builder-style `.send()`
 * overload with separate html/text bodies — CF Email Service composes the
 * multipart MIME envelope for us.
 */
export async function sendMagicLink(
  env: Env,
  toEmail: string,
  magicUrl: string,
): Promise<void> {
  if (env.EMAIL_DEV_STUB === '1') {
    // eslint-disable-next-line no-console
    console.log(
      `\n[EMAIL_DEV_STUB] Magic link for ${toEmail}:\n  ${magicUrl}\n`,
    );
    return;
  }

  if (!env.EMAIL_FROM) {
    throw new Error('sendMagicLink: EMAIL_FROM is not configured');
  }

  await env.EMAIL.send({
    from: env.EMAIL_FROM,
    to: toEmail,
    subject: 'เข้าสู่ระบบ Heritage / Sign in to Heritage',
    html: buildHtml(magicUrl),
    text: buildText(magicUrl),
  });
}
