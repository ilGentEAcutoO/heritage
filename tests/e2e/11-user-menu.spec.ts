/**
 * 11-user-menu.spec.ts — M1–M6 (Header login/user-menu interactions on /demo/wongsuriya).
 *
 * Per the shared contract:
 *   - Guests see data-testid="header-login" (a react-router Link, role=link, href="/login",
 *     accessible name "เข้าสู่ระบบ"). They do NOT see data-testid="user-menu-trigger".
 *   - Authenticated users see data-testid="user-menu-trigger" (the 👤 UserMenu) and NOT
 *     data-testid="header-login".
 *
 * Test IDs expected on the UserMenu component (authenticated only):
 *   data-testid="user-menu-trigger"   — the toggle button
 *   data-testid="user-menu"           — the dropdown panel
 *   data-testid="user-menu-item-home"   — หน้าหลัก link
 *   data-testid="user-menu-item-trees"  — ต้นไม้ของฉัน link
 *   data-testid="user-menu-item-logout" — ออกจากระบบ button
 */

import { test, expect } from '@playwright/test';
import { attachConsoleCapture } from './helpers/console';
import { makeE2EEmail, signupAndVerifyViaBackchannel } from './helpers/signup';

test.describe.configure({ mode: 'serial' });

const DEMO_URL = '/demo/wongsuriya';

test.describe('UserMenu', () => {
  // ---------------------------------------------------------------------------
  // M1 — guest: header-login visible, no user-menu-trigger
  // ---------------------------------------------------------------------------
  test('M1 — guest on demo: header-login visible, user-menu-trigger absent, no console errors', async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleMsgs = attachConsoleCapture(page);

    try {
      await page.goto(DEMO_URL);

      // Wait for tree to load
      await expect(page.getByTestId('tree-canvas')).toBeVisible({ timeout: 15_000 });

      // Guest sees the header-login link
      const loginLink = page.getByTestId('header-login');
      await expect(loginLink).toBeVisible({ timeout: 10_000 });

      // Guest does NOT see user-menu-trigger
      await expect(page.getByTestId('user-menu-trigger')).toHaveCount(0);

      expect(consoleMsgs.errors).toEqual([]);
      expect(consoleMsgs.warnings).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  // ---------------------------------------------------------------------------
  // M2 — guest clicks header-login → navigates to /login
  // ---------------------------------------------------------------------------
  test('M2 — guest login flow: click header-login → /login', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleMsgs = attachConsoleCapture(page);

    try {
      await page.goto(DEMO_URL);

      // Wait for tree to load
      await expect(page.getByTestId('tree-canvas')).toBeVisible({ timeout: 15_000 });

      const loginLink = page.getByTestId('header-login');
      await expect(loginLink).toBeVisible({ timeout: 10_000 });
      await loginLink.click();

      await expect(page).toHaveURL(/\/login$/, { timeout: 10_000 });

      expect(consoleMsgs.errors).toEqual([]);
      expect(consoleMsgs.warnings).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  // ---------------------------------------------------------------------------
  // M3 — authenticated user sees displayName, ต้นไม้ของฉัน, ออกจากระบบ; click → /trees
  // ---------------------------------------------------------------------------
  test('M3 — auth on demo: sees displayName + trees + logout; click trees → /trees', async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleMsgs = attachConsoleCapture(page);

    const email = makeE2EEmail('m3');
    const password = 'correctHorseBatteryStaple12';
    const displayName = 'Test M3 User';

    try {
      await signupAndVerifyViaBackchannel(ctx.request, email, password, displayName);

      await page.goto(DEMO_URL);

      const trigger = page.getByTestId('user-menu-trigger');
      await expect(trigger).toBeVisible({ timeout: 10_000 });
      await trigger.click();

      const menu = page.getByTestId('user-menu');
      await expect(menu).toBeVisible({ timeout: 5_000 });

      // Authenticated items
      await expect(page.getByTestId('user-menu-item-trees')).toBeVisible();
      await expect(page.getByTestId('user-menu-item-logout')).toBeVisible();

      // DisplayName appears somewhere inside the menu
      await expect(menu.getByText(displayName)).toBeVisible();

      // Guest-only items absent
      await expect(page.getByTestId('user-menu-item-login')).toBeHidden();

      // Click ต้นไม้ของฉัน → /trees
      await page.getByTestId('user-menu-item-trees').click();
      await expect(page).toHaveURL(/\/trees$/, { timeout: 10_000 });

      expect(consoleMsgs.errors).toEqual([]);
      expect(consoleMsgs.warnings).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  // ---------------------------------------------------------------------------
  // M4 — logout from demo: header-login returns, user-menu-trigger gone
  // ---------------------------------------------------------------------------
  test('M4 — logout from demo: click logout → header-login visible, user-menu-trigger absent', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleMsgs = attachConsoleCapture(page);

    const email = makeE2EEmail('m4');
    const password = 'correctHorseBatteryStaple12';

    try {
      await signupAndVerifyViaBackchannel(ctx.request, email, password);

      await page.goto(DEMO_URL);

      // Verify session is active before we do anything
      const meBefore = await ctx.request.get('/api/auth/me');
      expect(meBefore.status()).toBe(200);

      // Open menu and click logout
      const trigger = page.getByTestId('user-menu-trigger');
      await expect(trigger).toBeVisible({ timeout: 10_000 });
      await trigger.click();

      await expect(page.getByTestId('user-menu')).toBeVisible({ timeout: 5_000 });
      await page.getByTestId('user-menu-item-logout').click();

      // Session must be cleared — /api/auth/me returns 401
      await expect(async () => {
        const meAfter = await ctx.request.get('/api/auth/me');
        expect(meAfter.status()).toBe(401);
      }).toPass({ timeout: 10_000 });

      // After logout: guest login link should appear and user-menu-trigger should be gone
      const loginLink = page.getByTestId('header-login');
      await expect(loginLink).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId('user-menu-trigger')).toHaveCount(0);

      expect(consoleMsgs.errors).toEqual([]);
      expect(consoleMsgs.warnings).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  // ---------------------------------------------------------------------------
  // M5 — pressing Escape closes the menu (authenticated)
  // ---------------------------------------------------------------------------
  test('M5 — Escape closes menu', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleMsgs = attachConsoleCapture(page);

    const email = makeE2EEmail('m5');
    const password = 'correctHorseBatteryStaple12';

    try {
      await signupAndVerifyViaBackchannel(ctx.request, email, password);

      await page.goto(DEMO_URL);

      const trigger = page.getByTestId('user-menu-trigger');
      await expect(trigger).toBeVisible({ timeout: 10_000 });
      await trigger.click();

      const menu = page.getByTestId('user-menu');
      await expect(menu).toBeVisible({ timeout: 5_000 });

      // Press Escape
      await page.keyboard.press('Escape');

      await expect(menu).toBeHidden({ timeout: 5_000 });

      expect(consoleMsgs.errors).toEqual([]);
      expect(consoleMsgs.warnings).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  // ---------------------------------------------------------------------------
  // M6 — clicking outside (on canvas) closes the menu (authenticated)
  // ---------------------------------------------------------------------------
  test('M6 — click-outside closes menu', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleMsgs = attachConsoleCapture(page);

    const email = makeE2EEmail('m6');
    const password = 'correctHorseBatteryStaple12';

    try {
      await signupAndVerifyViaBackchannel(ctx.request, email, password);

      await page.goto(DEMO_URL);

      const trigger = page.getByTestId('user-menu-trigger');
      await expect(trigger).toBeVisible({ timeout: 10_000 });
      await trigger.click();

      const menu = page.getByTestId('user-menu');
      await expect(menu).toBeVisible({ timeout: 5_000 });

      // Click somewhere on the canvas (outside the menu)
      // The canvas is the main SVG/div area — click at a position unlikely to
      // overlap the menu (menu is typically top-right corner).
      await page.mouse.click(100, 400);

      await expect(menu).toBeHidden({ timeout: 5_000 });

      expect(consoleMsgs.errors).toEqual([]);
      expect(consoleMsgs.warnings).toEqual([]);
    } finally {
      await ctx.close();
    }
  });
});
