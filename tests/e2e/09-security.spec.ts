/**
 * 09-security.spec.ts — S18 (forged Origin POST is 403).
 */

import { test, expect } from '@playwright/test';
import { attachConsoleCapture } from './helpers/console';
import { makeE2EEmail, signupAndVerifyViaBackchannel } from './helpers/signup';

test.describe.configure({ mode: 'serial' });

test.describe('Security', () => {
  test('S18 — forged Origin → 403; matching Origin still works', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleMsgs = attachConsoleCapture(page);

    const email = makeE2EEmail('s18');
    const password = 'correctHorseBatteryStaple12';

    try {
      await signupAndVerifyViaBackchannel(ctx.request, email, password);

      await page.goto('/trees');
      // Navigate to /trees to ensure a real authed page
      await expect(page).toHaveURL(/\/trees$/, { timeout: 15_000 });

      // `Origin` is a forbidden header name in browsers — JS fetch() is not
      // allowed to set it, so page.evaluate can't simulate a forged origin.
      // Use Playwright's Node-side request context which CAN set arbitrary
      // headers. Session cookie is still present on ctx.request.
      const forgedRes = await ctx.request.post('/api/auth/logout', {
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://evil.example',
        },
      });
      expect(forgedRes.status(), 'forged Origin must be rejected with 403').toBe(403);

      // Sanity: normal logout still works when Origin matches (or is absent).
      const normalRes = await ctx.request.post('/api/auth/logout', {
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://heritage.jairukchan.com',
        },
      });
      expect([200, 204]).toContain(normalRes.status());

      expect(consoleMsgs.errors).toEqual([]);
      // Browser surfaces the 403 through console? That IS the expected failure
      // for a forged-origin fetch in practice — we filter here to keep the
      // assertion clean. Actually the 403 is a response status, not a console
      // error, so warnings/errors should stay empty.
      expect(consoleMsgs.warnings).toEqual([]);
    } finally {
      await ctx.close();
    }
  });
});
