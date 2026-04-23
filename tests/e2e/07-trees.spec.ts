/**
 * 07-trees.spec.ts — S12 (anon /trees redirect) + S13 (bogus slug 404) +
 * S14 (create tree via POST → appears in /trees).
 */

import { test, expect } from '@playwright/test';
import { attachConsoleCapture } from './helpers/console';
import { makeE2EEmail, signupAndVerifyViaBackchannel } from './helpers/signup';

test.describe.configure({ mode: 'serial' });

test.describe('Trees', () => {
  test('S12 — anon visiting /trees is redirected to /login', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleMsgs = attachConsoleCapture(page);

    try {
      await page.goto('/trees');
      await expect(page).toHaveURL(/\/login$/, { timeout: 10_000 });

      expect(consoleMsgs.errors).toEqual([]);
      expect(consoleMsgs.warnings).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  test('S13 — bogus slug shows not-found UI; /api/tree/… returns 404', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleMsgs = attachConsoleCapture(page);

    const bogus = `definitely-does-not-exist-${Date.now()}`;

    try {
      // API layer: 404
      const apiRes = await ctx.request.get(`/api/tree/${bogus}`);
      expect(apiRes.status()).toBe(404);

      // UI layer
      await page.goto(`/tree/${bogus}`);
      await expect(page.getByText(/ต้นไม้ไม่พบ|Tree not found/)).toBeVisible({ timeout: 10_000 });

      expect(consoleMsgs.errors).toEqual([]);
      expect(consoleMsgs.warnings).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  test('S14 — POST /api/trees creates a tree; appears on /trees with owner role', async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleMsgs = attachConsoleCapture(page);

    const email = makeE2EEmail('s14');
    const password = 'correctHorseBatteryStaple12';
    const slug = `e2e-tree-${Date.now()}`;

    try {
      await signupAndVerifyViaBackchannel(ctx.request, email, password);

      const createRes = await ctx.request.post('/api/trees', {
        data: { name: 'E2E Tree', slug },
        headers: { 'Content-Type': 'application/json' },
      });
      expect(createRes.status()).toBe(201);

      await page.goto('/trees');
      await expect(page.getByText('E2E Tree')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText('เจ้าของ').first()).toBeVisible();

      expect(consoleMsgs.errors).toEqual([]);
      expect(consoleMsgs.warnings).toEqual([]);
    } finally {
      await ctx.close();
    }
  });
});
