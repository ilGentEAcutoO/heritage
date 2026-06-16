/**
 * 01-landing.spec.ts — S1 (Guest at /), S1b (Logged-in at /), S2 (demo tree renders).
 */

import { test, expect } from '@playwright/test';
import { attachConsoleCapture } from './helpers/console';
import { makeE2EEmail, signupAndVerifyViaBackchannel } from './helpers/signup';

test.describe.configure({ mode: 'serial' });

test.describe('Landing + demo tree', () => {
  // ---------------------------------------------------------------------------
  // S1 — Guest at /: tree-canvas visible, header-login present, no demo splash
  // ---------------------------------------------------------------------------
  test('S1 — Landing (guest): tree-canvas renders, header-login visible, no demo splash link, no console errors', async ({ page }) => {
    const consoleMsgs = attachConsoleCapture(page);

    await page.goto('/');

    // The guest view renders the embedded TreeView (URL stays "/")
    const canvas = page.getByTestId('tree-canvas');
    await expect(canvas).toBeVisible({ timeout: 15_000 });

    // At least one person node rendered
    const personNodes = page.locator('[data-person]');
    await expect(personNodes.first()).toBeVisible({ timeout: 10_000 });

    // Guest login link must be visible in the TreeView header
    const loginLink = page.getByTestId('header-login');
    await expect(loginLink).toBeVisible({ timeout: 10_000 });
    await expect(loginLink).toHaveRole('link');
    await expect(loginLink).toHaveAttribute('href', '/login');
    await expect(loginLink).toHaveAccessibleName(/เข้าสู่ระบบ/);

    // The OLD splash CTA "ดู demo tree" must NOT be present (design changed)
    await expect(page.getByRole('link', { name: /ดู demo tree/ })).toHaveCount(0);

    // Let any delayed console errors arrive
    await page.waitForTimeout(500);

    expect(consoleMsgs.errors, `console errors: ${consoleMsgs.errors.join(' | ')}`).toEqual([]);
    expect(consoleMsgs.warnings, `console warnings: ${consoleMsgs.warnings.join(' | ')}`).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // S1b — Logged-in user at /: Landing splash, no tree-canvas
  // ---------------------------------------------------------------------------
  test('S1b — Landing (logged-in): logout-button + ดูต้นไม้ของฉัน visible, no tree-canvas, no console errors', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleMsgs = attachConsoleCapture(page);

    const email = makeE2EEmail('s1b');
    const password = 'correctHorseBatteryStaple12';

    try {
      await signupAndVerifyViaBackchannel(ctx.request, email, password);

      await page.goto('/');

      // Logged-in users see the Landing splash with a logout button
      const logoutBtn = page.getByTestId('logout-button');
      await expect(logoutBtn).toBeVisible({ timeout: 10_000 });

      // And a link to their trees
      const treesLink = page.getByRole('link', { name: /ดูต้นไม้ของฉัน/ });
      await expect(treesLink).toBeVisible();

      // The embedded TreeView (tree-canvas) must NOT be visible for logged-in users
      await expect(page.getByTestId('tree-canvas')).toHaveCount(0);

      // Let any delayed console errors arrive
      await page.waitForTimeout(500);

      expect(consoleMsgs.errors, `console errors: ${consoleMsgs.errors.join(' | ')}`).toEqual([]);
      expect(consoleMsgs.warnings, `console warnings: ${consoleMsgs.warnings.join(' | ')}`).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  // ---------------------------------------------------------------------------
  // S2 — /demo/wongsuriya renders + FCP measured
  // ---------------------------------------------------------------------------
  test('S2 — Demo tree /demo/wongsuriya renders, FCP measured, no console errors', async ({ page }) => {
    const consoleMsgs = attachConsoleCapture(page);

    await page.goto('/demo/wongsuriya');

    const canvas = page.getByTestId('tree-canvas');
    await expect(canvas).toBeVisible({ timeout: 15_000 });

    // At least one person node rendered
    const personNodes = page.locator('[data-person]');
    await expect(personNodes.first()).toBeVisible({ timeout: 10_000 });
    const count = await personNodes.count();
    expect(count).toBeGreaterThan(0);

    // Measure FCP from the page (first-contentful-paint Performance entry)
    // Give the browser a moment to report the entry.
    await page.waitForTimeout(1000);
    const fcp = await page.evaluate<number | null>(() => {
      const entry = performance.getEntriesByName('first-contentful-paint')[0];
      return entry ? entry.startTime : null;
    });

    // Append the FCP to the test's annotations so the reporter prints it.
    test.info().annotations.push({
      type: 'fcp-ms',
      description: fcp !== null ? `${Math.round(fcp)}` : 'unavailable',
    });
    if (fcp !== null) {
      // eslint-disable-next-line no-console
      console.log(`[S2] FCP = ${Math.round(fcp)}ms, people=${count}`);
    }

    expect(consoleMsgs.errors, `console errors: ${consoleMsgs.errors.join(' | ')}`).toEqual([]);
    expect(consoleMsgs.warnings, `console warnings: ${consoleMsgs.warnings.join(' | ')}`).toEqual([]);
  });
});
