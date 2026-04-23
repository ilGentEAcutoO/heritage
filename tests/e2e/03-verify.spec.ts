/**
 * 03-verify.spec.ts — S5 (verify happy path via backchannel).
 */

import { test, expect } from '@playwright/test';
import { attachConsoleCapture } from './helpers/console';
import { makeE2EEmail, signupAndMintRawVerifyToken } from './helpers/signup';

test.describe.configure({ mode: 'serial' });

test.describe('Verify', () => {
  test('S5 — /auth/verify?token redirects to /trees and GET /me returns 200', async ({ page }) => {
    const consoleMsgs = attachConsoleCapture(page);

    const email = makeE2EEmail('s5');
    const password = 'correctHorseBatteryStaple12';

    // Use page.request so the session cookie lands on this context after verify.
    const { raw } = await signupAndMintRawVerifyToken(page.request, email, password);

    await page.goto(`/auth/verify?token=${encodeURIComponent(raw)}`);

    // Verify page auto-POSTs to /api/auth/verify, then navigates to /trees.
    await expect(page).toHaveURL(/\/trees$/, { timeout: 15_000 });

    // Confirm /api/auth/me returns 200 with this email
    const meRes = await page.request.get('/api/auth/me');
    expect(meRes.status()).toBe(200);
    const body = (await meRes.json()) as { user: { email: string } };
    expect(body.user.email).toBe(email);

    expect(consoleMsgs.errors).toEqual([]);
    expect(consoleMsgs.warnings).toEqual([]);
  });
});
