/**
 * 06-reset.spec.ts — S10 (request-reset) + S11 (reset-confirm happy path).
 */

import { test, expect } from '@playwright/test';
import { attachConsoleCapture } from './helpers/console';
import {
  makeE2EEmail,
  requestResetAndMintRawToken,
  signupAndVerifyViaBackchannel,
} from './helpers/signup';

test.describe.configure({ mode: 'serial' });

test.describe('Password reset', () => {
  test('S10 — request-reset shows neutral "if email exists" copy', async ({ page }) => {
    const consoleMsgs = attachConsoleCapture(page);
    const email = makeE2EEmail('s10');

    await page.goto('/auth/reset');
    await page.getByLabel('อีเมล').fill(email);
    await page.getByRole('button', { name: /ส่งลิงก์รีเซ็ต/ }).click();

    await expect(page.getByText(/ถ้าอีเมลนี้มีบัญชี/)).toBeVisible();

    expect(consoleMsgs.errors).toEqual([]);
    expect(consoleMsgs.warnings).toEqual([]);
  });

  test('S11 — full reset flow: new password works for login', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleMsgs = attachConsoleCapture(page);

    const email = makeE2EEmail('s11');
    const oldPassword = 'correctHorseBatteryStaple12';
    const newPassword = 'changedHorseBatteryStaple34';

    try {
      // Create verified user
      await signupAndVerifyViaBackchannel(ctx.request, email, oldPassword);

      // Request reset + mint raw token via backchannel
      const { raw } = await requestResetAndMintRawToken(ctx.request, email);

      // Go to reset-confirm page; submit new password
      await page.goto(`/auth/reset/confirm?token=${encodeURIComponent(raw)}`);

      const pwInputs = page.locator('input[type="password"]');
      await pwInputs.nth(0).fill(newPassword);
      await pwInputs.nth(1).fill(newPassword);
      await page.getByRole('button', { name: /ตั้งรหัสผ่านใหม่/ }).click();

      await expect(page).toHaveURL(/\/login\?reset=1$/, { timeout: 15_000 });
      await expect(page.getByText(/รีเซ็ตรหัสผ่านสำเร็จ/)).toBeVisible();

      // Login with new password should work
      await page.getByLabel('อีเมล').fill(email);
      await page.getByLabel('รหัสผ่าน').fill(newPassword);
      await page.getByRole('button', { name: /เข้าสู่ระบบ/ }).click();

      await expect(page).toHaveURL(/\/trees$/, { timeout: 15_000 });

      expect(consoleMsgs.errors).toEqual([]);
      expect(consoleMsgs.warnings).toEqual([]);
    } finally {
      await ctx.close();
    }
  });
});
