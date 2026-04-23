/**
 * 01-landing.spec.ts — S1 (Landing page anon), S2 (demo tree renders).
 */

import { test, expect } from '@playwright/test';
import { attachConsoleCapture } from './helpers/console';

test.describe.configure({ mode: 'serial' });

test.describe('Landing + demo tree', () => {
  test('S1 — Landing (anon): CTA + login link visible, no console errors', async ({ page }) => {
    const consoleMsgs = attachConsoleCapture(page);

    await page.goto('/');

    const demoLink = page.getByRole('link', { name: /ดู demo tree/ });
    await expect(demoLink).toBeVisible();
    await expect(demoLink).toHaveAttribute('href', '/demo/wongsuriya');

    const loginLink = page.getByRole('link', { name: /เข้าสู่ระบบ/ });
    await expect(loginLink).toBeVisible();
    await expect(loginLink).toHaveAttribute('href', '/login');

    // Let any delayed console errors arrive
    await page.waitForTimeout(500);

    expect(consoleMsgs.errors, `console errors: ${consoleMsgs.errors.join(' | ')}`).toEqual([]);
    expect(consoleMsgs.warnings, `console warnings: ${consoleMsgs.warnings.join(' | ')}`).toEqual([]);
  });

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
