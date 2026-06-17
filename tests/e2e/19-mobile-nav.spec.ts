/**
 * 19-mobile-nav.spec.ts — Workstream 15A: mobile slide-out navigation e2e.
 *
 * Runs against the deployed production URL (or local dev via baseURL in playwright.config).
 * All scenarios use a mobile viewport (390×800) to exercise the ≤820px breakpoint.
 *
 * Flow:
 *   MN1 — hamburger is visible + sidebar is off-screen initially;
 *          click hamburger → sidebar (#sidebar-nav) slides into view
 *   MN2 — with nav open, click a person in the people list →
 *          nav closes & ProfileDrawer appears
 *   MN3 — with nav open, press ESC → nav closes
 *
 * All scenarios assert no console errors.
 */

import { test, expect } from '@playwright/test';
import { attachConsoleCapture } from './helpers/console';

// All tests in this file run at a mobile viewport
test.use({ viewport: { width: 390, height: 800 } });

const DEMO_URL = '/demo/wongsuriya';

test.describe('Mobile slide-out navigation', () => {
  // MN1 — hamburger visible, sidebar off-screen initially; click opens it
  test('MN1 — hamburger visible; clicking it opens the sidebar', async ({ page }) => {
    const consoleMsgs = attachConsoleCapture(page);

    await page.goto(DEMO_URL);
    // Wait for the tree to load
    await expect(page.getByTestId('tree-canvas')).toBeVisible({ timeout: 15_000 });

    // Hamburger toggle must be visible at mobile size
    const toggle = page.getByTestId('nav-toggle');
    await expect(toggle).toBeVisible({ timeout: 5_000 });

    // Sidebar should start closed — no "open" class, visibility:hidden
    const sidebar = page.locator('#sidebar-nav');
    await expect(sidebar).toBeAttached();
    await expect(sidebar).not.toHaveClass(/\bopen\b/);

    // Click hamburger to open nav
    await toggle.click();

    // Primary assertion: "open" class applied
    await expect(sidebar).toHaveClass(/\bopen\b/, { timeout: 3_000 });

    // Geometry sanity check: sidebar must now be on-screen
    const box = await sidebar.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);

    // aria-expanded must reflect open state
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    expect(consoleMsgs.errors, `console errors: ${consoleMsgs.errors.join(' | ')}`).toEqual([]);
  });

  // MN2 — selecting a person closes the nav and opens the ProfileDrawer
  test('MN2 — selecting a person closes nav and shows ProfileDrawer', async ({ page }) => {
    const consoleMsgs = attachConsoleCapture(page);

    await page.goto(DEMO_URL);
    await expect(page.getByTestId('tree-canvas')).toBeVisible({ timeout: 15_000 });

    // Open the nav
    await page.getByTestId('nav-toggle').click();
    const sidebar = page.locator('#sidebar-nav');
    await expect(sidebar).toHaveClass(/\bopen\b/, { timeout: 3_000 });

    // Click the first person item in the people list
    const firstPersonBtn = sidebar.locator('.people-item').first();
    await expect(firstPersonBtn).toBeVisible({ timeout: 5_000 });
    await firstPersonBtn.click();

    // Primary close assertion: "open" class removed
    await expect(sidebar).not.toHaveClass(/\bopen\b/, { timeout: 3_000 });
    // FIX 1 makes this correct too — visibility:hidden removes it from visible tree
    await expect(sidebar).not.toBeVisible({ timeout: 3_000 });

    // ProfileDrawer (.drawer) should be visible
    await expect(page.locator('.drawer')).toBeVisible({ timeout: 5_000 });

    expect(consoleMsgs.errors, `console errors: ${consoleMsgs.errors.join(' | ')}`).toEqual([]);
  });

  // MN3 — pressing ESC closes the nav
  test('MN3 — pressing ESC closes the open nav', async ({ page }) => {
    const consoleMsgs = attachConsoleCapture(page);

    await page.goto(DEMO_URL);
    await expect(page.getByTestId('tree-canvas')).toBeVisible({ timeout: 15_000 });

    // Open the nav
    await page.getByTestId('nav-toggle').click();
    const sidebar = page.locator('#sidebar-nav');
    await expect(sidebar).toHaveClass(/\bopen\b/, { timeout: 3_000 });

    // Press ESC
    await page.keyboard.press('Escape');

    // Primary close assertion: "open" class removed
    await expect(sidebar).not.toHaveClass(/\bopen\b/, { timeout: 3_000 });
    // FIX 1 makes this correct too
    await expect(sidebar).not.toBeVisible({ timeout: 3_000 });

    expect(consoleMsgs.errors, `console errors: ${consoleMsgs.errors.join(' | ')}`).toEqual([]);
  });
});
