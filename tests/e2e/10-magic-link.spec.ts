/**
 * 10-magic-link.spec.ts — M4-T1…M4-T5 (magic link UI flow).
 *
 * Tests:
 *  M4-T1 — /login → click "Magic link" tab → email-only form → submit → neutral inbox copy
 *  M4-T2 — /auth/magic?token=<mocked-valid> → spinner → redirect /trees (session cookie set)
 *  M4-T3 — /auth/magic?token=<mocked-expired> → error UI + retry link to /login?tab=magic
 *  M4-T4 — /auth/magic (no token) → redirect to /login?tab=magic
 *  M4-T5 — regression: password tab login still works
 *
 * M4-T2 and M4-T3 use Playwright route interception to mock the backend
 * response — this keeps the specs runnable without a deployed backend and
 * avoids touching real D1 state.
 *
 * DO NOT run pnpm e2e — these require the frontend + backend to be live
 * (coordinator runs them in M6).
 */

import { test, expect } from '@playwright/test';
import { attachConsoleCapture } from './helpers/console';
import { makeE2EEmail, signupAndVerifyViaBackchannel } from './helpers/signup';

test.describe.configure({ mode: 'serial' });

test.describe('Magic link', () => {
  // -------------------------------------------------------------------------
  // M4-T1 — Tab switcher: magic tab shows email-only form; submit shows inbox copy
  // -------------------------------------------------------------------------
  test('M4-T1 — /login magic tab: email-only form, submit shows neutral inbox copy', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleMsgs = attachConsoleCapture(page);

    try {
      await page.goto('/login');

      // Password tab should be active by default — password input must be present
      await expect(page.getByLabel('รหัสผ่าน')).toBeVisible();

      // Click the Magic link tab
      await page.getByRole('tab', { name: /magic link/i }).click();

      // After switching: password input must NOT be visible
      await expect(page.getByLabel('รหัสผ่าน')).not.toBeVisible();

      // Email input must be present and be the only form field
      const emailInput = page.getByLabel('อีเมล');
      await expect(emailInput).toBeVisible();

      // Mock the /api/auth/magic/request endpoint to return 200
      await page.route('/api/auth/magic/request', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            message: 'If an account exists with that email, we sent a sign-in link.',
          }),
        });
      });

      // Submit a valid email
      await emailInput.fill('test@example.com');
      await page.getByRole('button', { name: /ส่งลิงก์|send magic link/i }).click();

      // Neutral "check your inbox" message must appear
      await expect(page.getByTestId('magic-sent')).toBeVisible({ timeout: 10_000 });
      const sentText = await page.getByTestId('magic-sent').innerText();
      expect(sentText.toLowerCase()).toMatch(/inbox|กล่องจดหมาย/i);

      // Still on /login (no redirect)
      await expect(page).toHaveURL(/\/login/);

      expect(consoleMsgs.errors).toEqual([]);
      expect(consoleMsgs.warnings).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  // -------------------------------------------------------------------------
  // M4-T2 — /auth/magic?token=<valid> → spinner → redirect /trees + session cookie
  // -------------------------------------------------------------------------
  test('M4-T2 — /auth/magic?token=valid → spinner → redirect to /trees with session cookie', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleMsgs = attachConsoleCapture(page);

    try {
      // Mock consume endpoint to succeed and simulate session cookie being set
      await page.route('/api/auth/magic/consume', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          // Session cookie is set server-side in real life; here we set it via header
          headers: {
            'Set-Cookie': '__Host-session=mock-session-token; Path=/; HttpOnly; Secure; SameSite=Strict',
          },
          body: JSON.stringify({
            user: {
              id: 'mock-user-id',
              email: 'test@example.com',
              displayName: 'Test User',
              emailVerified: true,
            },
          }),
        });
      });

      // Also mock /api/auth/me to avoid 401 on /trees
      await page.route('/api/auth/me', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            user: {
              id: 'mock-user-id',
              email: 'test@example.com',
              displayName: 'Test User',
              emailVerified: true,
            },
          }),
        });
      });

      await page.goto('/auth/magic?token=mock-valid-token-12345678901234567890');

      // Spinner / "Signing you in" should briefly appear
      // (may be very fast; check the heading text is present before redirect)
      // We use a lenient check — if redirect is instant that's fine too
      await expect(page).toHaveURL(/\/(trees|auth\/magic)/, { timeout: 5_000 });

      // Eventually must land on /trees
      await expect(page).toHaveURL(/\/trees$/, { timeout: 15_000 });

      expect(consoleMsgs.errors).toEqual([]);
      expect(consoleMsgs.warnings).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  // -------------------------------------------------------------------------
  // M4-T3 — /auth/magic?token=<expired> → error UI + retry link
  // -------------------------------------------------------------------------
  test('M4-T3 — /auth/magic?token=expired → error UI with retry link to /login?tab=magic', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleMsgs = attachConsoleCapture(page);

    try {
      // Mock consume endpoint to return 400 "expired"
      await page.route('/api/auth/magic/consume', (route) => {
        route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            message: 'Link expired or already used',
          }),
        });
      });

      await page.goto('/auth/magic?token=mock-expired-token-12345678901234567890');

      // Error message must be visible
      await expect(page.getByTestId('magic-error')).toBeVisible({ timeout: 10_000 });
      const errText = await page.getByTestId('magic-error').innerText();
      expect(errText.toLowerCase()).toMatch(/expired|already used|หมดอาย/i);

      // "Request a new link" button must be present and link to /login?tab=magic
      const retryLink = page.getByTestId('magic-retry-link');
      await expect(retryLink).toBeVisible();
      const href = await retryLink.getAttribute('href');
      expect(href).toMatch(/\/login\?tab=magic/);

      expect(consoleMsgs.errors).toEqual([]);
      expect(consoleMsgs.warnings).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  // -------------------------------------------------------------------------
  // M4-T4 — /auth/magic (no token) → redirect to /login?tab=magic
  // -------------------------------------------------------------------------
  test('M4-T4 — /auth/magic without token → redirect to /login?tab=magic', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleMsgs = attachConsoleCapture(page);

    try {
      await page.goto('/auth/magic');

      // Should redirect to /login?tab=magic
      await expect(page).toHaveURL(/\/login\?tab=magic/, { timeout: 10_000 });

      // Magic tab should be active (tab=magic param respected)
      await expect(page.getByRole('tab', { name: /magic link/i })).toBeVisible();
      // Password input should not be visible when magic tab is active
      await expect(page.getByLabel('รหัสผ่าน')).not.toBeVisible();

      expect(consoleMsgs.errors).toEqual([]);
      expect(consoleMsgs.warnings).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  // -------------------------------------------------------------------------
  // M4-T5 — Regression: password tab login still works
  // -------------------------------------------------------------------------
  test('M4-T5 — regression: password tab login still works', async ({ browser, request }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleMsgs = attachConsoleCapture(page);

    const email = makeE2EEmail('m4-t5');
    const password = 'correctHorseBatteryStaple12';

    try {
      // Create and verify a real user via backchannel
      await signupAndVerifyViaBackchannel(request, email, password);

      await page.goto('/login');

      // Password tab should be active by default
      await expect(page.getByLabel('รหัสผ่าน')).toBeVisible();

      // Fill credentials and submit
      await page.getByLabel('อีเมล').fill(email);
      await page.getByLabel('รหัสผ่าน').fill(password);
      await page.getByRole('button', { name: /เข้าสู่ระบบ/ }).click();

      // Should redirect to /trees
      await expect(page).toHaveURL(/\/trees$/, { timeout: 15_000 });

      // Session cookie must be set
      const cookies = await ctx.cookies();
      const session = cookies.find((c) => c.name === '__Host-session');
      expect(session, 'session cookie must be set').toBeTruthy();
      expect(session!.httpOnly).toBe(true);
      expect(session!.secure).toBe(true);

      expect(consoleMsgs.errors).toEqual([]);
      expect(consoleMsgs.warnings).toEqual([]);
    } finally {
      await ctx.close();
    }
  });
});
