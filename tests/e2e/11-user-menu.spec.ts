/**
 * 11-user-menu.spec.ts — M1–M6 (UserMenu dropdown interactions on /demo/wongsuriya).
 *
 * TDD: UserMenu component does not exist yet. All tests are expected to fail
 * until TASK-003 (UserMenu.tsx) and TASK-004 (wiring into TreeView) are done.
 *
 * Test IDs expected on the rendered component:
 *   data-testid="user-menu-trigger"   — the toggle button
 *   data-testid="user-menu"           — the dropdown panel
 *   data-testid="user-menu-item-home"   — หน้าหลัก link
 *   data-testid="user-menu-item-login"  — เข้าสู่ระบบ link
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
  // M1 — guest sees home + login; clicking home navigates to /
  // ---------------------------------------------------------------------------
  test('M1 — guest on demo: trigger visible, menu shows หน้าหลัก + เข้าสู่ระบบ, click home → /', async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleMsgs = attachConsoleCapture(page);

    try {
      await page.goto(DEMO_URL);

      // Trigger must be visible without interacting
      const trigger = page.getByTestId('user-menu-trigger');
      await expect(trigger).toBeVisible({ timeout: 10_000 });

      // Open the menu
      await trigger.click();

      const menu = page.getByTestId('user-menu');
      await expect(menu).toBeVisible({ timeout: 5_000 });

      // Guest items present
      await expect(page.getByTestId('user-menu-item-home')).toBeVisible();
      await expect(page.getByTestId('user-menu-item-login')).toBeVisible();

      // Auth-only items absent
      await expect(page.getByTestId('user-menu-item-trees')).toBeHidden();
      await expect(page.getByTestId('user-menu-item-logout')).toBeHidden();

      // Click home → navigate to /
      await page.getByTestId('user-menu-item-home').click();
      await expect(page).toHaveURL('/', { timeout: 10_000 });

      expect(consoleMsgs.errors).toEqual([]);
      expect(consoleMsgs.warnings).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  // ---------------------------------------------------------------------------
  // M2 — guest clicks เข้าสู่ระบบ → navigates to /login
  // ---------------------------------------------------------------------------
  test('M2 — guest login flow: click เข้าสู่ระบบ → /login', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleMsgs = attachConsoleCapture(page);

    try {
      await page.goto(DEMO_URL);

      const trigger = page.getByTestId('user-menu-trigger');
      await expect(trigger).toBeVisible({ timeout: 10_000 });
      await trigger.click();

      await expect(page.getByTestId('user-menu')).toBeVisible({ timeout: 5_000 });

      await page.getByTestId('user-menu-item-login').click();
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
  // M4 — logout from demo: after click logout, menu shows guest state
  // ---------------------------------------------------------------------------
  test('M4 — logout from demo: click logout → guest menu state', async ({ browser }) => {
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

      // Re-open menu and confirm guest state
      await expect(trigger).toBeVisible({ timeout: 10_000 });
      await trigger.click();
      await expect(page.getByTestId('user-menu')).toBeVisible({ timeout: 5_000 });
      await expect(page.getByTestId('user-menu-item-login')).toBeVisible();
      await expect(page.getByTestId('user-menu-item-logout')).toBeHidden();

      expect(consoleMsgs.errors).toEqual([]);
      expect(consoleMsgs.warnings).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  // ---------------------------------------------------------------------------
  // M5 — pressing Escape closes the menu
  // ---------------------------------------------------------------------------
  test('M5 — Escape closes menu', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleMsgs = attachConsoleCapture(page);

    try {
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
  // M6 — clicking outside (on canvas) closes the menu
  // ---------------------------------------------------------------------------
  test('M6 — click-outside closes menu', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleMsgs = attachConsoleCapture(page);

    try {
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
