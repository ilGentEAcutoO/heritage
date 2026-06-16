/**
 * 14-create-tree.spec.ts — Stage 1 of the multi-tree epic.
 *
 * Logged-in user creates a tree from /trees and lands on it; the new tree then
 * appears in the dashboard under "owned". The slug is e2e-prefixed so the global
 * teardown (purgeE2ETrees: slug LIKE 'e2e-%') cleans it from prod after the run.
 */

import { test, expect } from '@playwright/test';
import { attachConsoleCapture } from './helpers/console';
import { makeE2EEmail, signupAndVerifyViaBackchannel } from './helpers/signup';

test.describe.configure({ mode: 'serial' });

test.describe('Create tree', () => {
  test('SC1 — create a tree → land on /tree/:slug, then it shows in dashboard', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleMsgs = attachConsoleCapture(page);

    const email = makeE2EEmail('create');
    const password = 'correctHorseBatteryStaple12';
    // Unique + e2e- prefixed so it is unique across re-runs AND cleaned by teardown.
    const slug = `e2e-tree-${Date.now()}`;
    const treeName = 'ครอบครัวทดสอบ SC1';

    try {
      await signupAndVerifyViaBackchannel(ctx.request, email, password, 'Create Tester');

      await page.goto('/trees');

      // Open the create dialog
      await page.getByTestId('create-tree-button').click();
      await expect(page.getByTestId('create-tree-dialog')).toBeVisible({ timeout: 10_000 });

      // Fill name + slug, submit
      await page.getByTestId('create-tree-name').fill(treeName);
      await page.getByTestId('create-tree-slug').fill(slug);
      await page.getByTestId('create-tree-submit').click();

      // Lands on the new tree
      await expect(page).toHaveURL(new RegExp(`/tree/${slug}$`), { timeout: 10_000 });

      // Back to the dashboard → the new tree appears under "owned"
      await page.goto('/trees');
      await expect(page.getByRole('link', { name: new RegExp(treeName) })).toBeVisible({ timeout: 10_000 });

      expect(consoleMsgs.errors, `console errors: ${consoleMsgs.errors.join(' | ')}`).toEqual([]);
      expect(consoleMsgs.warnings, `console warnings: ${consoleMsgs.warnings.join(' | ')}`).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  test('SC2 — slug validation: submit disabled until slug is valid', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    const email = makeE2EEmail('create2');
    const password = 'correctHorseBatteryStaple12';

    try {
      await signupAndVerifyViaBackchannel(ctx.request, email, password);
      await page.goto('/trees');
      await page.getByTestId('create-tree-button').click();
      await expect(page.getByTestId('create-tree-dialog')).toBeVisible({ timeout: 10_000 });

      // Name only, invalid slug → submit disabled
      await page.getByTestId('create-tree-name').fill('ครอบครัวทดสอบ');
      await page.getByTestId('create-tree-slug').fill('-bad slug');
      await expect(page.getByTestId('create-tree-submit')).toBeDisabled();

      // Fix slug → enabled
      await page.getByTestId('create-tree-slug').fill(`e2e-valid-${Date.now()}`);
      await expect(page.getByTestId('create-tree-submit')).toBeEnabled();
    } finally {
      await ctx.close();
    }
  });
});
