/**
 * Email sending utilities for Heritage.
 *
 * Declares a local structural interface (SendEmailBinding) that is compatible with the
 * platform's SendEmail binding (worker-configuration.d.ts) but keeps the lib swappable
 * (Resend fallback, test mocks). The platform type uses EmailAddress for `from`/`replyTo`,
 * while our interface uses the plain-object form — both are structurally compatible via
 * the CF binding's overloaded send() signature.
 */

/** Minimum binding shape we consume. Structurally compatible with Cloudflare's SendEmail. */
export interface SendEmailBinding {
  send(message: {
    to: string | string[];
    from: string | { email: string; name?: string };
    subject: string;
    text?: string;
    html?: string;
    replyTo?: string | { email: string; name?: string };
    cc?: string | string[];
    bcc?: string | string[];
    headers?: Record<string, string>;
  }): Promise<void>;
}

export interface VerificationEmailOptions {
  to: string;
  token: string;
  appUrl: string; // e.g. https://heritage.jairukchan.com
}

export interface PasswordResetEmailOptions {
  to: string;
  token: string;
  appUrl: string;
}

/** Canonical sender address — must be an onboarded domain on Cloudflare Email Service. */
export const FROM_ADDRESS = 'noreply@jairukchan.com';

/** Display name shown in email clients. */
export const FROM_NAME = 'Heritage';

// ---------------------------------------------------------------------------
// Verification email
// ---------------------------------------------------------------------------

export async function sendVerificationEmail(
  binding: SendEmailBinding,
  opts: VerificationEmailOptions,
): Promise<void> {
  const verifyUrl = `${opts.appUrl}/auth/verify?token=${encodeURIComponent(opts.token)}`;

  const text = [
    'สวัสดีครับ,',
    '',
    'กรุณายืนยันอีเมลเพื่อเริ่มใช้งาน Heritage ลิงก์จะหมดอายุใน 24 ชั่วโมง',
    '/ Please verify your email to start using Heritage. This link expires in 24 hours:',
    '',
    verifyUrl,
    '',
    'ถ้าคุณไม่ได้สมัคร ให้ละเว้นอีเมลนี้ได้เลย.',
    'If you didn\'t sign up, you can safely ignore this email.',
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Heritage — ยืนยันอีเมล / Verify your email</title>
</head>
<body style="margin:0;padding:0;background:#f9f7f4;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f7f4;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:#6b8f5e;padding:24px 32px;">
              <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">Heritage</span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 8px;font-size:20px;color:#2d2d2d;">ยืนยันอีเมลของคุณ / Verify your email</h1>
              <p style="margin:0 0 4px;font-size:14px;color:#555;">สวัสดีครับ,</p>
              <p style="margin:0 0 4px;font-size:14px;color:#555;">กรุณายืนยันอีเมลเพื่อเริ่มใช้งาน Heritage ลิงก์จะหมดอายุใน <strong>24 ชั่วโมง</strong></p>
              <p style="margin:0 0 24px;font-size:14px;color:#555;">Please verify your email to start using Heritage. This link expires in <strong>24 hours</strong>.</p>
              <p style="margin:0 0 24px;">
                <a href="${verifyUrl}"
                   style="display:inline-block;padding:12px 28px;background:#6b8f5e;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:600;">
                  ยืนยันอีเมล / Verify email
                </a>
              </p>
              <p style="margin:0 0 24px;font-size:13px;color:#777;">
                หรือคัดลอกลิงก์นี้ / Or copy this link:<br>
                <a href="${verifyUrl}" style="color:#6b8f5e;word-break:break-all;">${verifyUrl}</a>
              </p>
              <hr style="border:none;border-top:1px solid #ebebeb;margin:0 0 24px;">
              <p style="margin:0;font-size:12px;color:#aaa;">
                ถ้าคุณไม่ได้สมัคร ให้ละเว้นอีเมลนี้ได้เลย.<br>
                If you didn't sign up, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  await binding.send({
    to: opts.to,
    from: { email: FROM_ADDRESS, name: FROM_NAME },
    subject: 'Heritage — ยืนยันอีเมล / Verify your email',
    text,
    html,
  });
}

// ---------------------------------------------------------------------------
// Password-reset email
// ---------------------------------------------------------------------------

export async function sendPasswordResetEmail(
  binding: SendEmailBinding,
  opts: PasswordResetEmailOptions,
): Promise<void> {
  const resetUrl = `${opts.appUrl}/auth/reset/confirm?token=${encodeURIComponent(opts.token)}`;

  const text = [
    'สวัสดีครับ,',
    '',
    'คุณได้ขอรีเซ็ตรหัสผ่านสำหรับบัญชี Heritage ลิงก์จะหมดอายุใน 1 ชั่วโมง:',
    '',
    resetUrl,
    '',
    '—',
    '',
    'Hi,',
    '',
    'You requested a password reset for your Heritage account. This link expires in 1 hour:',
    '',
    resetUrl,
    '',
    'ถ้าคุณไม่ได้ขอรีเซ็ต ให้ละเว้นอีเมลนี้ได้เลย รหัสผ่านของคุณจะไม่เปลี่ยนแปลง.',
    'If you didn\'t request this, you can safely ignore this email. Your password will not change.',
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Heritage — รีเซ็ตรหัสผ่าน / Reset your password</title>
</head>
<body style="margin:0;padding:0;background:#f9f7f4;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f7f4;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:#6b8f5e;padding:24px 32px;">
              <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">Heritage</span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 8px;font-size:20px;color:#2d2d2d;">รีเซ็ตรหัสผ่าน / Reset your password</h1>
              <p style="margin:0 0 4px;font-size:14px;color:#555;">คุณได้ขอรีเซ็ตรหัสผ่านสำหรับบัญชี Heritage ลิงก์จะหมดอายุใน <strong>1 ชั่วโมง</strong></p>
              <p style="margin:0 0 24px;font-size:14px;color:#555;">You requested a password reset for your Heritage account. This link expires in <strong>1 hour</strong>.</p>
              <p style="margin:0 0 24px;">
                <a href="${resetUrl}"
                   style="display:inline-block;padding:12px 28px;background:#c4855a;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:600;">
                  รีเซ็ตรหัสผ่าน / Reset password
                </a>
              </p>
              <p style="margin:0 0 24px;font-size:13px;color:#777;">
                หรือคัดลอกลิงก์นี้ / Or copy this link:<br>
                <a href="${resetUrl}" style="color:#c4855a;word-break:break-all;">${resetUrl}</a>
              </p>
              <hr style="border:none;border-top:1px solid #ebebeb;margin:0 0 24px;">
              <p style="margin:0;font-size:12px;color:#aaa;">
                ถ้าคุณไม่ได้ขอรีเซ็ต ให้ละเว้นอีเมลนี้ได้เลย รหัสผ่านของคุณจะไม่เปลี่ยนแปลง.<br>
                If you didn't request this, you can safely ignore this email. Your password will not change.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  await binding.send({
    to: opts.to,
    from: { email: FROM_ADDRESS, name: FROM_NAME },
    subject: 'Heritage — รีเซ็ตรหัสผ่าน / Reset your password',
    text,
    html,
  });
}
