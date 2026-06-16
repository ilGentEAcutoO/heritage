/**
 * 16-sharing.spec.ts — Workstream 09 Stage 3: sharing loop e2e.
 *
 * Runs against the deployed production URL (or local dev via baseURL in playwright.config).
 *
 * Flow uses TWO browser contexts — owner (ctxA) and invitee (ctxB):
 *
 *   SH1 — owner signs up, creates a tree, opens ShareDialog, sets visibility to
 *          'shared', invites the invitee email as viewer. Invitee then signs up
 *          and verifies (backfill accept-on-verify fires); navigates to /trees and
 *          asserts the shared tree appears under "ที่แชร์กับฉัน".
 *
 *   SH2 — public-link sub-test: owner sets visibility to 'public' and asserts
 *          the "คัดลอกลิงก์" button (data-testid="share-copy-link") is visible.
 *
 * Key selectors used:
 *   - getByRole('button', { name: 'แชร์' })          — share dialog trigger (header)
 *   - locator('input[name="visibility"][value="shared"]') — shared radio
 *   - locator('input[name="visibility"][value="public"]') — public radio
 *   - getByLabel('อีเมลผู้รับเชิญ')                  — invite email input (aria-label)
 *   - getByRole('button', { name: 'เชิญ' })           — invite submit
 *   - getByTestId('share-copy-link')                  — copy-link button (public mode)
 *   - getByText('ที่แชร์กับฉัน')                      — shared section heading in /trees
 *   - getByRole('link', { name: treeName })           — shared tree link in /trees
 *
 * Both emails follow the e2e-%@example.com pattern and slugs follow e2e-share-%
 * so global teardown (purgeE2ETrees + purgeE2EUsers) cleans them from prod after
 * the run.
 *
 * Contract testids (ws09 Stage 3):
 *   share-copy-link — "คัดลอกลิงก์" button in ShareDialog when visibility is 'public'
 */

import { test, expect } from '@playwright/test';
import { attachConsoleCapture } from './helpers/console';
import { makeE2EEmail, signupAndVerifyViaBackchannel } from './helpers/signup';

test.describe.configure({ mode: 'serial' });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a tree via the UI starting from /trees (user must already be logged in). */
async function createTreeViaUI(
  page: import('@playwright/test').Page,
  slug: string,
  treeName: string,
): Promise<void> {
  await page.goto('/trees');
  await page.getByTestId('create-tree-button').click();
  await expect(page.getByTestId('create-tree-dialog')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('create-tree-name').fill(treeName);
  await page.getByTestId('create-tree-slug').fill(slug);
  await page.getByTestId('create-tree-submit').click();
  // Wait until we land on the tree view
  await expect(page).toHaveURL(new RegExp(`/tree/${slug}$`), { timeout: 20_000 });
  await expect(page.getByTestId('tree-canvas')).toBeVisible({ timeout: 20_000 });
}

/** Open the ShareDialog via the "แชร์" header button (owner-only). */
async function openShareDialog(page: import('@playwright/test').Page): Promise<void> {
  const shareBtn = page.getByRole('button', { name: 'แชร์' });
  await expect(shareBtn).toBeVisible({ timeout: 15_000 });
  await shareBtn.click();
  // The dialog renders when shareOpen === true; wait for the heading
  await expect(page.getByRole('dialog', { name: 'จัดการการแชร์ต้นไม้' })).toBeVisible({
    timeout: 10_000,
  });
}

// ---------------------------------------------------------------------------
// SH1 — full sharing loop: owner invites, invitee verifies → tree appears
// ---------------------------------------------------------------------------
test.describe('Sharing loop', () => {
  test('SH1 — owner invites invitee; invitee verifies → tree in shared section', async ({
    browser,
  }) => {
    // ── Owner context (ctxA) ────────────────────────────────────────────────
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    const consoleMsgsA = attachConsoleCapture(pageA);

    const ownerEmail = makeE2EEmail('share-owner');
    const ownerPassword = 'correctHorseBatteryStaple12';

    // Invitee is NOT yet a user — they will sign up after the invite is sent.
    // Using a deterministic-enough timestamp tag so both emails are e2e-% pattern.
    const inviteeTag = `share-inv-${Date.now()}`;
    const inviteeEmail = `e2e-${inviteeTag}@example.com`;
    const inviteePassword = 'correctHorseBatteryStaple12';

    const slug = `e2e-share-${Date.now()}`;
    const treeName = 'ครอบครัวทดสอบ SH1';

    try {
      // --- Owner: signup + create tree ---
      await signupAndVerifyViaBackchannel(ctxA.request, ownerEmail, ownerPassword, 'SH1 Owner');
      await createTreeViaUI(pageA, slug, treeName);

      // --- Owner: open ShareDialog ---
      await openShareDialog(pageA);

      // --- Owner: set visibility to 'shared' ---
      const sharedRadio = pageA.locator('input[name="visibility"][value="shared"]');
      await expect(sharedRadio).toBeVisible({ timeout: 10_000 });
      // Click the radio label (the <label> wraps the radio + text)
      await sharedRadio.click();

      // Wait for the radio to be checked and the invite section to appear
      await expect(sharedRadio).toBeChecked({ timeout: 10_000 });
      await expect(pageA.getByLabel('อีเมลผู้รับเชิญ')).toBeVisible({ timeout: 10_000 });

      // --- Owner: invite the invitee email as viewer ---
      await pageA.getByLabel('อีเมลผู้รับเชิญ').fill(inviteeEmail);
      // Role selector defaults to viewer; verify and ensure it's 'viewer'
      const roleSelect = pageA.getByLabel('บทบาท');
      await expect(roleSelect).toBeVisible({ timeout: 5_000 });
      await roleSelect.selectOption('viewer');

      const inviteBtn = pageA.getByRole('button', { name: 'เชิญ' });
      await expect(inviteBtn).toBeVisible({ timeout: 5_000 });
      await inviteBtn.click();

      // Wait for invite to complete — the email should appear in the share list
      // (either as 'pending' or 'accepted' if invitee already exists)
      await expect(async () => {
        const pageContent = await pageA.content();
        expect(pageContent).toContain(inviteeEmail);
      }).toPass({ timeout: 20_000 });

      // ── Invitee context (ctxB) ───────────────────────────────────────────
      const ctxB = await browser.newContext();
      const pageB = await ctxB.newPage();
      const consoleMsgsB = attachConsoleCapture(pageB);

      try {
        // Invitee signs up with the SAME email that was invited.
        // signupAndVerifyViaBackchannel calls POST /api/auth/verify which (per auth.ts
        // ~L274-288) auto-accepts any pending tree_shares for the verified email.
        await signupAndVerifyViaBackchannel(
          ctxB.request,
          inviteeEmail,
          inviteePassword,
          'SH1 Invitee',
        );

        // Invitee navigates to /trees
        await pageB.goto('/trees');

        // Wait for the page to finish loading (section appears after fetch)
        await expect(async () => {
          // The shared section heading must be visible
          await expect(pageB.getByText('ที่แชร์กับฉัน')).toBeVisible({ timeout: 5_000 });
        }).toPass({ timeout: 30_000 });

        // The shared tree should appear under that section as a link
        await expect(pageB.getByRole('link', { name: new RegExp(treeName) })).toBeVisible({
          timeout: 20_000,
        });

        // Console sanity checks for invitee page
        expect(
          consoleMsgsB.errors,
          `invitee console errors: ${consoleMsgsB.errors.join(' | ')}`,
        ).toEqual([]);
        expect(
          consoleMsgsB.warnings,
          `invitee console warnings: ${consoleMsgsB.warnings.join(' | ')}`,
        ).toEqual([]);
      } finally {
        await ctxB.close();
      }

      // Console sanity checks for owner page
      expect(
        consoleMsgsA.errors,
        `owner console errors: ${consoleMsgsA.errors.join(' | ')}`,
      ).toEqual([]);
      expect(
        consoleMsgsA.warnings,
        `owner console warnings: ${consoleMsgsA.warnings.join(' | ')}`,
      ).toEqual([]);
    } finally {
      await ctxA.close();
    }
  });

  // ---------------------------------------------------------------------------
  // SH2 — public-link sub-test: visibility 'public' → copy-link button visible
  // ---------------------------------------------------------------------------
  test('SH2 — public visibility → share-copy-link button is visible', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleMsgs = attachConsoleCapture(page);

    const email = makeE2EEmail('share-pub');
    const password = 'correctHorseBatteryStaple12';
    const slug = `e2e-share-pub-${Date.now()}`;
    const treeName = 'ครอบครัวทดสอบ SH2';

    try {
      await signupAndVerifyViaBackchannel(ctx.request, email, password, 'SH2 Owner');
      await createTreeViaUI(page, slug, treeName);

      // Open ShareDialog
      await openShareDialog(page);

      // Set visibility to 'public'
      const publicRadio = page.locator('input[name="visibility"][value="public"]');
      await expect(publicRadio).toBeVisible({ timeout: 10_000 });
      await publicRadio.click();
      await expect(publicRadio).toBeChecked({ timeout: 10_000 });

      // The copy-link button (data-testid="share-copy-link") should appear
      await expect(page.getByTestId('share-copy-link')).toBeVisible({ timeout: 15_000 });

      expect(consoleMsgs.errors, `console errors: ${consoleMsgs.errors.join(' | ')}`).toEqual([]);
      expect(consoleMsgs.warnings, `console warnings: ${consoleMsgs.warnings.join(' | ')}`).toEqual([]);
    } finally {
      await ctx.close();
    }
  });
});
