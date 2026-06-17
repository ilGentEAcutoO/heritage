/**
 * 20-node-style.spec.ts — Workstream 15: per-tree node style e2e.
 *
 * Runs against the deployed production URL (or local dev via baseURL in playwright.config).
 *
 * Flow:
 *   NS1 — signup + create a tree; open NodeStylePicker, pick 'polaroid';
 *          assert `.app` gets class `shape-polaroid` (the rendered canvas shape changes)
 *   NS2 — reload the page; assert `shape-polaroid` is still on `.app`
 *          (persistence via PATCH /:slug/node-style + DB round-trip)
 *   NS3 — demo/non-owner (/demo/wongsuriya) gets an ephemeral preview that resets on reload;
 *          assert `.app` gets `shape-square` and loses it after reload; no console errors
 *
 * Contract testids (ws15 node style):
 *   node-style-picker-button    — trigger button that opens the shape popover
 *   node-style-option-<key>     — option button for each shape key
 *                                 e.g. node-style-option-circle, node-style-option-polaroid, …
 *
 * Global teardown purges:
 *   - trees with slug LIKE 'e2e-%'
 *   - users e2e-%@example.com
 */

import { test, expect } from '@playwright/test';
import { attachConsoleCapture } from './helpers/console';
import { makeE2EEmail, signupAndVerifyViaBackchannel } from './helpers/signup';

test.describe.configure({ mode: 'serial' });

test.describe('Node style picker — per-tree node shape', () => {
  let treeSlug: string;
  let treeUrl: string;

  // Shared credentials so NS2 can navigate back to the same tree as the same owner.
  let sharedEmail: string;
  let sharedPassword: string;

  // ---------------------------------------------------------------------------
  // NS1 — signup + create tree, pick 'polaroid', assert .app has shape-polaroid class
  // ---------------------------------------------------------------------------
  test('NS1 — owner opens NodeStylePicker, picks polaroid, .app gets shape-polaroid class', async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleMsgs = attachConsoleCapture(page);

    sharedEmail = makeE2EEmail('nodestyle');
    sharedPassword = 'correctHorseBatteryStaple12';
    treeSlug = `e2e-nodestyle-${Date.now()}`;
    treeUrl = `/tree/${treeSlug}`;
    const treeName = 'ครอบครัว NodeStyle Test';

    try {
      await signupAndVerifyViaBackchannel(ctx.request, sharedEmail, sharedPassword, 'NodeStyle Owner');

      // Navigate to /trees and create a new tree
      await page.goto('/trees');
      await page.getByTestId('create-tree-button').click();
      await expect(page.getByTestId('create-tree-dialog')).toBeVisible({ timeout: 10_000 });

      await page.getByTestId('create-tree-name').fill(treeName);
      await page.getByTestId('create-tree-slug').fill(treeSlug);
      await page.getByTestId('create-tree-submit').click();

      // Land on the new tree
      await expect(page).toHaveURL(new RegExp(`/tree/${treeSlug}$`), { timeout: 15_000 });
      await expect(page.getByTestId('tree-canvas')).toBeVisible({ timeout: 15_000 });

      // Capture the .app classList BEFORE picking a shape so we can assert it changed.
      const appEl = page.locator('.app');
      const classBefore = await appEl.getAttribute('class');
      expect(classBefore).not.toMatch(/shape-polaroid/);

      // The node-style-picker-button should be visible (owner).
      const pickerBtn = page.getByTestId('node-style-picker-button');
      await expect(pickerBtn).toBeVisible({ timeout: 10_000 });

      // Open the shape popover and pick 'polaroid'
      await pickerBtn.click();
      const polaroidOption = page.getByTestId('node-style-option-polaroid');
      await expect(polaroidOption).toBeVisible({ timeout: 8_000 });
      await polaroidOption.click();

      // The PATCH fires + refetch + re-render. Assert the .app root gets shape-polaroid.
      // This is the authoritative render assertion — the class drives the CSS shape change.
      await expect(appEl).toHaveClass(/\bshape-polaroid\b/, { timeout: 15_000 });

      // Secondary: aria-selected on the option should reflect the selection (picker open state)
      await expect(async () => {
        await pickerBtn.click();
        const selected = page.getByTestId('node-style-option-polaroid');
        expect(await selected.getAttribute('aria-selected')).toBe('true');
        await page.keyboard.press('Escape');
      }).toPass({ timeout: 10_000 });

      expect(consoleMsgs.errors, `console errors: ${consoleMsgs.errors.join(' | ')}`).toEqual([]);
      expect(consoleMsgs.warnings, `console warnings: ${consoleMsgs.warnings.join(' | ')}`).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  // ---------------------------------------------------------------------------
  // NS2 — reload the page; shape-polaroid must persist (round-tripped through the DB)
  // ---------------------------------------------------------------------------
  test('NS2 — reload the tree page, .app still has shape-polaroid class', async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleMsgs = attachConsoleCapture(page);

    try {
      // Log in as the same owner who set the node style in NS1.
      const loginRes = await ctx.request.post('/api/auth/login', {
        data: { email: sharedEmail, password: sharedPassword },
        headers: { 'Content-Type': 'application/json' },
      });
      if (!loginRes.ok()) {
        const txt = await loginRes.text();
        throw new Error(`login failed in NS2: ${loginRes.status()} ${txt}`);
      }

      // Navigate directly to the tree URL (fresh page load).
      await page.goto(treeUrl);
      await expect(page.getByTestId('tree-canvas')).toBeVisible({ timeout: 15_000 });

      // shape-polaroid must survive a full reload (persisted via DB + PATCH).
      await expect(page.locator('.app')).toHaveClass(/\bshape-polaroid\b/, { timeout: 20_000 });

      expect(consoleMsgs.errors, `console errors: ${consoleMsgs.errors.join(' | ')}`).toEqual([]);
      expect(consoleMsgs.warnings, `console warnings: ${consoleMsgs.warnings.join(' | ')}`).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  // ---------------------------------------------------------------------------
  // NS3 — demo/non-owner visitor gets ephemeral preview; resets on reload
  // ---------------------------------------------------------------------------
  test('NS3 — non-owner demo visitor gets ephemeral node style preview that resets on reload', async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleMsgs = attachConsoleCapture(page);

    try {
      // Navigate to the public demo tree (unauthenticated)
      await page.goto('/demo/wongsuriya');
      await expect(page.getByTestId('tree-canvas')).toBeVisible({ timeout: 20_000 });

      const appEl = page.locator('.app');
      const pickerBtn = page.getByTestId('node-style-picker-button');
      await expect(pickerBtn).toBeVisible({ timeout: 10_000 });

      // Pick 'square' as a non-owner ephemeral preview
      await pickerBtn.click();
      const squareOption = page.getByTestId('node-style-option-square');
      await expect(squareOption).toBeVisible({ timeout: 8_000 });
      await squareOption.click();

      // The .app root should get shape-square (local preview, no PATCH)
      await expect(appEl).toHaveClass(/\bshape-square\b/, { timeout: 10_000 });

      // Reload — ephemeral preview should reset (not persisted for non-owner)
      await page.reload();
      await expect(page.getByTestId('tree-canvas')).toBeVisible({ timeout: 20_000 });

      // After reload, .app must NOT have shape-square (reverts to stored value / default)
      const classAfterReload = await appEl.getAttribute('class');
      expect(classAfterReload ?? '').not.toMatch(/\bshape-square\b/);

      expect(consoleMsgs.errors, `console errors: ${consoleMsgs.errors.join(' | ')}`).toEqual([]);
      expect(consoleMsgs.warnings, `console warnings: ${consoleMsgs.warnings.join(' | ')}`).toEqual([]);
    } finally {
      await ctx.close();
    }
  });
});
