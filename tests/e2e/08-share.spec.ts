/**
 * 08-share.spec.ts — S15 (dialog opens) + S16 (visibility cache-purge regression)
 * + S17 (auto-accept on invite of already-verified user).
 */

import { test, expect } from '@playwright/test';
import { attachConsoleCapture } from './helpers/console';
import { makeE2EEmail, signupAndVerifyViaBackchannel } from './helpers/signup';

test.describe.configure({ mode: 'serial' });

test.describe('Share', () => {
  test('S15 — share dialog opens for owner with three visibility radios', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleMsgs = attachConsoleCapture(page);

    const ownerEmail = makeE2EEmail('s15-owner');
    const password = 'correctHorseBatteryStaple12';
    const slug = `e2e-share-s15-${Date.now()}`;

    try {
      await signupAndVerifyViaBackchannel(ctx.request, ownerEmail, password);
      const createRes = await ctx.request.post('/api/trees', {
        data: { name: 'S15 Tree', slug },
        headers: { 'Content-Type': 'application/json' },
      });
      expect(createRes.status()).toBe(201);

      await page.goto(`/tree/${slug}`);
      const shareBtn = page.getByRole('button', { name: /แชร์/ });
      await expect(shareBtn).toBeVisible({ timeout: 15_000 });
      await shareBtn.click();

      // Dialog opens
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();

      // Three visibility radios
      const radios = dialog.locator('input[type="radio"][name="visibility"]');
      await expect(radios).toHaveCount(3);

      expect(consoleMsgs.errors).toEqual([]);
      expect(consoleMsgs.warnings).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  test('S16 — visibility flip purges edge cache (N-R3-3 regression)', async ({ browser }) => {
    const ownerCtx = await browser.newContext();
    const anonCtx = await browser.newContext();
    const page = await ownerCtx.newPage();
    const consoleMsgs = attachConsoleCapture(page);

    const ownerEmail = makeE2EEmail('s16-owner');
    const password = 'correctHorseBatteryStaple12';
    const slug = `e2e-share-s16-${Date.now()}`;

    try {
      await signupAndVerifyViaBackchannel(ownerCtx.request, ownerEmail, password);

      // Create the tree public so anon can fetch + cache
      const createRes = await ownerCtx.request.post('/api/trees', {
        data: { name: 'S16 Tree', slug, visibility: 'public' },
        headers: { 'Content-Type': 'application/json' },
      });
      expect(createRes.status()).toBe(201);

      // Anon fetch — first hit (MISS), second hit should HIT from caches.default
      const first = await anonCtx.request.get(`/api/tree/${slug}`);
      expect(first.status()).toBe(200);

      const second = await anonCtx.request.get(`/api/tree/${slug}`);
      expect(second.status()).toBe(200);

      // Flip to private via PATCH. The app patches from the same origin as the
      // page.request, so the Origin header matches APP_URL.
      const patchRes = await ownerCtx.request.patch(`/api/tree/${slug}/visibility`, {
        data: { visibility: 'private' },
        headers: { 'Content-Type': 'application/json' },
      });
      expect(patchRes.status()).toBe(200);

      // Anon refetch — cache must be purged → 404 (not stale 200)
      const afterPurge = await anonCtx.request.get(`/api/tree/${slug}`);
      expect(afterPurge.status(), 'cache must be purged on visibility flip').toBe(404);

      expect(consoleMsgs.errors).toEqual([]);
      expect(consoleMsgs.warnings).toEqual([]);
    } finally {
      await ownerCtx.close();
      await anonCtx.close();
    }
  });

  test('S17 — invite auto-accepts for already-verified invitee', async ({ browser }) => {
    const ownerCtx = await browser.newContext();
    const inviteeCtx = await browser.newContext();
    const inviteePage = await inviteeCtx.newPage();
    const consoleMsgs = attachConsoleCapture(inviteePage);

    const ownerEmail = makeE2EEmail('s17-owner');
    const inviteeEmail = makeE2EEmail('s17-invitee');
    const password = 'correctHorseBatteryStaple12';
    const slug = `e2e-share-s17-${Date.now()}`;

    try {
      await signupAndVerifyViaBackchannel(ownerCtx.request, ownerEmail, password);
      await signupAndVerifyViaBackchannel(inviteeCtx.request, inviteeEmail, password);

      // Owner creates a shared tree
      const createRes = await ownerCtx.request.post('/api/trees', {
        data: { name: 'S17 Tree', slug, visibility: 'shared' },
        headers: { 'Content-Type': 'application/json' },
      });
      expect(createRes.status()).toBe(201);

      // Owner invites invitee
      const inviteRes = await ownerCtx.request.post(`/api/tree/${slug}/shares`, {
        data: { email: inviteeEmail, role: 'viewer' },
        headers: { 'Content-Type': 'application/json' },
      });
      expect(inviteRes.status()).toBe(201);
      const inviteBody = (await inviteRes.json()) as { share: { status: string } };
      expect(inviteBody.share.status).toBe('accepted');

      // Invitee visits /trees and sees the shared tree immediately
      await inviteePage.goto('/trees');
      await expect(inviteePage.getByText('S17 Tree')).toBeVisible({ timeout: 10_000 });

      expect(consoleMsgs.errors).toEqual([]);
      expect(consoleMsgs.warnings).toEqual([]);
    } finally {
      await ownerCtx.close();
      await inviteeCtx.close();
    }
  });
});
