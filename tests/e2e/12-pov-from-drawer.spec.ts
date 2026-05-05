/**
 * 12-pov-from-drawer.spec.ts — POV switch via ProfileDrawer.
 *
 * TDD: these tests INTENTIONALLY FAIL until ProfileDrawer + TreeView are wired
 * (TASK-008, TASK-009). Any non-TDD failures (missing selector, syntax error,
 * etc.) should be fixed immediately.
 *
 * P1: clicking a non-me node → drawer opens → click POV button → ActiveViewPill updates
 * P2: clicking the "me" node (p12) → drawer shows readonly chip, no POV button
 * P3: click POV button → drawer stays open (no close-on-click side-effect)
 */

import { test, expect } from '@playwright/test';
import { attachConsoleCapture } from './helpers/console';

// p12 is the hard-coded initial selectedId in TreeView (line 43) and is isMe:true.
// We use a different person for P1/P3. p1 is the first person in the demo tree,
// which is guaranteed non-me. Adjust if the demo data changes.
const ME_NODE_SELECTOR = '[data-person="p12"]';
// Pick a sibling/parent — p1 is consistently non-me in the wongsuriya demo fixture.
const NON_ME_NODE_SELECTOR = '[data-person="p1"]';

const DRAWER_SELECTOR = '.drawer';
const POV_BTN_SELECTOR = '[data-testid="profile-pov-button"]';
const ACTIVE_VIEW_PILL_SELECTOR = '.active-view-pill';

test.describe('POV from ProfileDrawer', () => {
  test('P1 — clicking non-me node then POV button updates ActiveViewPill', async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleMsgs = attachConsoleCapture(page);

    try {
      await page.goto('/demo/wongsuriya');

      // Wait for tree canvas to render at least one node
      await page.waitForSelector(ME_NODE_SELECTOR, { timeout: 15_000 });

      // Click a non-me person to open the drawer
      await page.click(NON_ME_NODE_SELECTOR);

      // ProfileDrawer should appear
      await expect(page.locator(DRAWER_SELECTOR)).toBeVisible({ timeout: 5_000 });

      // Capture the current pill text before the click
      const pillBefore = await page.locator(ACTIVE_VIEW_PILL_SELECTOR).textContent();

      // Click the POV button in the drawer
      await page.click(POV_BTN_SELECTOR);

      // ActiveViewPill should now reflect the new POV — select value or visible text changes
      await expect(page.locator(ACTIVE_VIEW_PILL_SELECTOR)).not.toHaveText(pillBefore ?? '', {
        timeout: 5_000,
      });

      expect(consoleMsgs.errors).toEqual([]);
      expect(consoleMsgs.warnings).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  test('P2 — clicking the "me" node shows readonly chip, no POV button', async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleMsgs = attachConsoleCapture(page);

    try {
      await page.goto('/demo/wongsuriya');

      // Wait for tree canvas
      await page.waitForSelector(ME_NODE_SELECTOR, { timeout: 15_000 });

      // Click the "me" node (p12 — isMe: true)
      await page.click(ME_NODE_SELECTOR);

      // Drawer opens
      await expect(page.locator(DRAWER_SELECTOR)).toBeVisible({ timeout: 5_000 });

      // Readonly chip present
      await expect(page.locator(DRAWER_SELECTOR)).toContainText('กำลังดูจากมุมของคนนี้', {
        timeout: 5_000,
      });

      // No clickable POV button for "me"
      await expect(page.locator(POV_BTN_SELECTOR)).toBeHidden();

      expect(consoleMsgs.errors).toEqual([]);
      expect(consoleMsgs.warnings).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  test('P3 — drawer stays open after clicking POV button', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleMsgs = attachConsoleCapture(page);

    try {
      await page.goto('/demo/wongsuriya');

      // Wait for tree canvas
      await page.waitForSelector(ME_NODE_SELECTOR, { timeout: 15_000 });

      // Open a non-me person's drawer
      await page.click(NON_ME_NODE_SELECTOR);
      await expect(page.locator(DRAWER_SELECTOR)).toBeVisible({ timeout: 5_000 });

      // Click the POV button
      await page.click(POV_BTN_SELECTOR);

      // Drawer must STILL be visible — no accidental close
      await expect(page.locator(DRAWER_SELECTOR)).toBeVisible({ timeout: 3_000 });

      expect(consoleMsgs.errors).toEqual([]);
      expect(consoleMsgs.warnings).toEqual([]);
    } finally {
      await ctx.close();
    }
  });
});
