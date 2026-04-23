/**
 * 05-logout.spec.ts — S9 (logout round-trip via Landing button).
 */

import { test, expect } from '@playwright/test';
import { attachConsoleCapture } from './helpers/console';
import { makeE2EEmail, signupAndVerifyViaBackchannel } from './helpers/signup';

test.describe.configure({ mode: 'serial' });

test.describe('Logout', () => {
  test('S9 — logout: /api/auth/me returns 401, UI shows anon state', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleMsgs = attachConsoleCapture(page);

    const email = makeE2EEmail('s9');
    const password = 'correctHorseBatteryStaple12';

    try {
      // Sign up + verify (session attaches to ctx.request and page.request)
      await signupAndVerifyViaBackchannel(ctx.request, email, password);

      // Sanity: /me works pre-logout
      const meBefore = await ctx.request.get('/api/auth/me');
      expect(meBefore.status()).toBe(200);

      // Go to Landing where the logout button lives
      await page.goto('/');

      // Wait for logout button to appear (session loaded)
      const logoutBtn = page.getByTestId('logout-button');
      await expect(logoutBtn).toBeVisible({ timeout: 10_000 });
      await logoutBtn.click();

      // After logout the button disappears and the login link returns
      await expect(page.getByRole('link', { name: /เข้าสู่ระบบ/ })).toBeVisible({ timeout: 10_000 });
      await expect(logoutBtn).toBeHidden();

      // /me → 401
      const meAfter = await ctx.request.get('/api/auth/me');
      expect(meAfter.status()).toBe(401);

      expect(consoleMsgs.errors).toEqual([]);
      expect(consoleMsgs.warnings).toEqual([]);
    } finally {
      await ctx.close();
    }
  });
});
