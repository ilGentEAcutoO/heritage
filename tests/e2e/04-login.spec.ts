/**
 * 04-login.spec.ts — S6 (valid login) + S7 (wrong pw) + S8 (unknown email).
 *
 * Creates ONE verified user in beforeAll; S6/S7 share it. S8 uses a random
 * unknown email. Generic error copy must be identical between S7 and S8.
 *
 * All three tests run within a single describe — Playwright will create ONE
 * browser context per test by default; we create fresh contexts so the S6
 * login doesn't leak a cookie into S7/S8.
 */

import { test, expect } from '@playwright/test';
import { attachConsoleCapture } from './helpers/console';
import { makeE2EEmail, signupAndVerifyViaBackchannel } from './helpers/signup';

test.describe.configure({ mode: 'serial' });

const GENERIC_ERROR = 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';

test.describe('Login', () => {
  let email: string;
  const password = 'correctHorseBatteryStaple12';

  test.beforeAll(async ({ request }) => {
    email = makeE2EEmail('s6-8');
    await signupAndVerifyViaBackchannel(request, email, password);
  });

  test('S6 — valid login redirects to /trees; __Host-session cookie set', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleMsgs = attachConsoleCapture(page);

    try {
      await page.goto('/login');
      await page.getByLabel('อีเมล').fill(email);
      await page.getByLabel('รหัสผ่าน').fill(password);
      await page.getByRole('button', { name: /เข้าสู่ระบบ/ }).click();

      await expect(page).toHaveURL(/\/trees$/, { timeout: 15_000 });

      // Cookie check
      const cookies = await ctx.cookies();
      const session = cookies.find((c) => c.name === '__Host-session');
      expect(session, 'session cookie must be set').toBeTruthy();
      expect(session!.httpOnly).toBe(true);
      expect(session!.secure).toBe(true);

      expect(consoleMsgs.errors).toEqual([]);
      expect(consoleMsgs.warnings).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  test('S7 — wrong password shows generic error; stays on /login', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleMsgs = attachConsoleCapture(page);

    try {
      await page.goto('/login');
      await page.getByLabel('อีเมล').fill(email);
      await page.getByLabel('รหัสผ่าน').fill('definitelyWrongPassword12');
      await page.getByRole('button', { name: /เข้าสู่ระบบ/ }).click();

      await expect(page.getByText(GENERIC_ERROR)).toBeVisible();
      await expect(page).toHaveURL(/\/login$/);

      expect(consoleMsgs.errors).toEqual([]);
      expect(consoleMsgs.warnings).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  test('S8 — unknown email shows SAME generic error copy as S7', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleMsgs = attachConsoleCapture(page);

    const unknown = makeE2EEmail('s8-unknown');

    try {
      await page.goto('/login');
      await page.getByLabel('อีเมล').fill(unknown);
      await page.getByLabel('รหัสผ่าน').fill('anyPassword123456');
      await page.getByRole('button', { name: /เข้าสู่ระบบ/ }).click();

      const errLocator = page.getByText(GENERIC_ERROR);
      await expect(errLocator).toBeVisible();
      // String-equality parity check — make sure the error is EXACTLY the same
      // string as S7 shows, not just a superset.
      const actual = await errLocator.innerText();
      expect(actual.trim()).toBe(GENERIC_ERROR);
      await expect(page).toHaveURL(/\/login$/);

      expect(consoleMsgs.errors).toEqual([]);
      expect(consoleMsgs.warnings).toEqual([]);
    } finally {
      await ctx.close();
    }
  });
});
