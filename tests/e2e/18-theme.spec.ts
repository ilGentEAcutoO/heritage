/**
 * 18-theme.spec.ts — Workstream 11: per-tree theming e2e.
 *
 * Runs against the deployed production URL (or local dev via baseURL in playwright.config).
 *
 * Flow:
 *   TH1 — signup + create a tree; open ThemePicker, pick 'forest';
 *          assert the .app root carries a CSS-var inline style change
 *   TH2 — reload the page; assert the 'forest' palette vars are still applied
 *          (persistence via PATCH /:slug/theme + DB round-trip)
 *
 * Contract testids (ws11 theming):
 *   theme-picker-button       — trigger button that opens the palette popover
 *   theme-option-<key>        — option button for each palette key
 *                               e.g. theme-option-forest, theme-option-paper, …
 *
 * Global teardown purges:
 *   - trees with slug LIKE 'e2e-%'
 *   - users e2e-%@example.com
 */

import { test, expect } from '@playwright/test';
import { attachConsoleCapture } from './helpers/console';
import { makeE2EEmail, signupAndVerifyViaBackchannel } from './helpers/signup';

test.describe.configure({ mode: 'serial' });

/** CSS custom properties set by the 'forest' (soft Sage) palette — see src/app/lib/palettes.ts. */
const FOREST_VARS: Record<string, string> = {
  '--paper': 'oklch(0.972 0.012 135)',
  '--leaf': 'oklch(0.62 0.07 145)',
};

/**
 * Read a single CSS custom-property value from the `.app` root element via
 * page.evaluate. Returns the trimmed string (or empty string if not set).
 */
async function readAppCssVar(page: import('@playwright/test').Page, varName: string): Promise<string> {
  return page.evaluate((v: string) => {
    const el = document.querySelector('.app') as HTMLElement | null;
    if (!el) return '';
    // Prefer inline style first (that is how the palette is applied), then
    // fall back to getComputedStyle for completeness.
    const inline = el.style.getPropertyValue(v).trim();
    if (inline) return inline;
    return getComputedStyle(el).getPropertyValue(v).trim();
  }, varName);
}

/**
 * Read ALL inline CSS custom properties set on the `.app` root.
 * Returns the full cssText of the element's inline style attribute.
 */
async function readAppInlineStyle(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.querySelector('.app') as HTMLElement | null;
    return el ? el.style.cssText : '';
  });
}

test.describe('Theme picker — per-tree palette', () => {
  let treeSlug: string;
  let treeUrl: string;

  // Shared credentials so TH2 can navigate back to the same tree as the same owner.
  let sharedEmail: string;
  let sharedPassword: string;

  // ---------------------------------------------------------------------------
  // TH1 — signup + create tree, pick 'forest' theme, assert inline CSS vars applied
  // ---------------------------------------------------------------------------
  test('TH1 — owner opens ThemePicker, picks forest, .app inline vars updated', async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleMsgs = attachConsoleCapture(page);

    sharedEmail = makeE2EEmail('theme');
    sharedPassword = 'correctHorseBatteryStaple12';
    treeSlug = `e2e-theme-${Date.now()}`;
    treeUrl = `/tree/${treeSlug}`;
    const treeName = 'ครอบครัว Theme Test';

    try {
      await signupAndVerifyViaBackchannel(ctx.request, sharedEmail, sharedPassword, 'Theme Owner');

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

      // Capture the .app inline style BEFORE picking a theme so we can assert it changed.
      const styleBefore = await readAppInlineStyle(page);

      // The theme-picker-button is owner-only; it should be visible.
      const pickerBtn = page.getByTestId('theme-picker-button');
      await expect(pickerBtn).toBeVisible({ timeout: 10_000 });

      // Open the palette popover
      await pickerBtn.click();

      // The 'forest' option should be visible in the popover
      const forestOption = page.getByTestId('theme-option-forest');
      await expect(forestOption).toBeVisible({ timeout: 8_000 });

      // Pick 'forest'
      await forestOption.click();

      // After picking, at least one forest CSS var should appear on the .app root.
      // We poll because the PATCH + refetch + re-render is async.
      await expect(async () => {
        const leafVal = await readAppCssVar(page, '--leaf');
        // The forest palette sets --leaf to oklch(0.75 0.1 140).
        // We normalise whitespace for a robust comparison.
        expect(leafVal.replace(/\s+/g, ' ')).toBe(FOREST_VARS['--leaf'].replace(/\s+/g, ' '));
      }).toPass({ timeout: 15_000 });

      // Also verify --paper changed
      await expect(async () => {
        const paperVal = await readAppCssVar(page, '--paper');
        expect(paperVal.replace(/\s+/g, ' ')).toBe(FOREST_VARS['--paper'].replace(/\s+/g, ' '));
      }).toPass({ timeout: 5_000 });

      // The overall inline style attribute must differ from the pre-pick snapshot
      // (either something was added, or the value changed).
      const styleAfter = await readAppInlineStyle(page);
      expect(styleAfter).not.toBe(styleBefore);
      // And it must mention at least one forest var
      expect(styleAfter).toContain('--');

      expect(consoleMsgs.errors, `console errors: ${consoleMsgs.errors.join(' | ')}`).toEqual([]);
      expect(consoleMsgs.warnings, `console warnings: ${consoleMsgs.warnings.join(' | ')}`).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  // ---------------------------------------------------------------------------
  // TH2 — reload the page; theme must persist (round-tripped through the DB)
  // ---------------------------------------------------------------------------
  test('TH2 — reload the tree page, forest palette vars still applied on .app', async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleMsgs = attachConsoleCapture(page);

    try {
      // Log in as the same owner who set the theme in TH1.
      const loginRes = await ctx.request.post('/api/auth/login', {
        data: { email: sharedEmail, password: sharedPassword },
        headers: { 'Content-Type': 'application/json' },
      });
      if (!loginRes.ok()) {
        const txt = await loginRes.text();
        throw new Error(`login failed in TH2: ${loginRes.status()} ${txt}`);
      }

      // Navigate directly to the tree URL (fresh page load).
      await page.goto(treeUrl);
      await expect(page.getByTestId('tree-canvas')).toBeVisible({ timeout: 15_000 });

      // Wait for the React app to finish rendering/fetching tree data.
      // The palette is set from the API response, so we poll until the var appears.
      await expect(async () => {
        const leafVal = await readAppCssVar(page, '--leaf');
        expect(leafVal.replace(/\s+/g, ' ')).toBe(FOREST_VARS['--leaf'].replace(/\s+/g, ' '));
      }).toPass({ timeout: 20_000 });

      // Also spot-check --paper
      const paperVal = await readAppCssVar(page, '--paper');
      expect(paperVal.replace(/\s+/g, ' ')).toBe(FOREST_VARS['--paper'].replace(/\s+/g, ' '));

      // The inline style on .app must be non-empty (palette is applied as inline vars)
      const styleAfterReload = await readAppInlineStyle(page);
      expect(styleAfterReload).toContain('--leaf');

      expect(consoleMsgs.errors, `console errors: ${consoleMsgs.errors.join(' | ')}`).toEqual([]);
      expect(consoleMsgs.warnings, `console warnings: ${consoleMsgs.warnings.join(' | ')}`).toEqual([]);
    } finally {
      await ctx.close();
    }
  });
});
