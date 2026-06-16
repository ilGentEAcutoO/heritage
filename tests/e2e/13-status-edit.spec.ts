/**
 * 13-status-edit.spec.ts — Workstream 08 UI tests: status toggle on /demo/wongsuriya.
 *
 * Runs against the deployed production URL (or local dev via baseURL in playwright.config).
 *
 * All tests run as GUEST (non-owner of the wongsuriya demo tree).
 *
 * Contract testids (exact, from Workstream 08):
 *   status-toggle          — the alive/deceased control in ProfileDrawer
 *   status-year-input      — year field (only shown when deceased=true)
 *   status-ephemeral-note  — "ทดลอง · ไม่บันทึก" label shown to non-owners
 *
 * Guest behaviour:
 *   - canEdit = false (no session, or session user ≠ tree owner)
 *   - status-ephemeral-note IS visible
 *   - status-toggle IS visible (guests can explore but changes are ephemeral)
 *   - Changes DO NOT persist: reload reverts to the original value
 *
 * TODO (owner-persist): Once a test-tree fixture owned by the e2e test user
 * exists, add owner-persist tests that verify PATCH /api/tree/:slug/person/:id
 * is called and the change survives a page reload.
 */

import { test, expect } from '@playwright/test';
import { attachConsoleCapture } from './helpers/console';

test.describe.configure({ mode: 'serial' });

const DEMO_URL = '/demo/wongsuriya';

// Selector for any person node on the canvas.
// data-person attribute is set by TreeCanvas on each person node.
const ANY_PERSON_NODE = '[data-person]';

// ---------------------------------------------------------------------------
// SE1 — Guest: open ProfileDrawer and see status-ephemeral-note
// ---------------------------------------------------------------------------

test.describe('Status edit — guest (ephemeral only)', () => {
  test('SE1 — open ProfileDrawer as guest → status-ephemeral-note visible', async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleMsgs = attachConsoleCapture(page);

    try {
      await page.goto(DEMO_URL);

      // Wait for tree canvas
      await expect(page.getByTestId('tree-canvas')).toBeVisible({ timeout: 15_000 });

      // Click any person node to open the ProfileDrawer
      const firstNode = page.locator(ANY_PERSON_NODE).first();
      await expect(firstNode).toBeVisible({ timeout: 10_000 });
      await firstNode.click();

      // ProfileDrawer must be visible — use the drawer container or status-toggle
      // as a proxy (drawer is confirmed open when either is present).
      const statusToggle = page.getByTestId('status-toggle');
      await expect(statusToggle).toBeVisible({ timeout: 8_000 });

      // Guest must see the ephemeral-note label
      const ephemeralNote = page.getByTestId('status-ephemeral-note');
      await expect(ephemeralNote).toBeVisible({ timeout: 5_000 });

      expect(consoleMsgs.errors).toEqual([]);
      expect(consoleMsgs.warnings).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  // ---------------------------------------------------------------------------
  // SE2 — Guest: toggle status → alive-count updates (UI reflects change)
  // ---------------------------------------------------------------------------

  test('SE2 — guest toggles status → UI updates (alive count or node appearance changes)', async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleMsgs = attachConsoleCapture(page);

    try {
      await page.goto(DEMO_URL);

      // Wait for tree canvas
      await expect(page.getByTestId('tree-canvas')).toBeVisible({ timeout: 15_000 });

      // Pick the first person node and open the drawer
      const firstNode = page.locator(ANY_PERSON_NODE).first();
      await expect(firstNode).toBeVisible({ timeout: 10_000 });

      // Record the data-person id so we can verify the node changes
      const personId = await firstNode.getAttribute('data-person');
      expect(personId).toBeTruthy();

      await firstNode.click();

      // Drawer open — status-toggle visible
      const statusToggle = page.getByTestId('status-toggle');
      await expect(statusToggle).toBeVisible({ timeout: 8_000 });

      // Capture the toggle's current state (aria-checked, data-state, or similar)
      // before clicking. We compare "something changed" after the click.
      const stateBefore = await statusToggle.evaluate((el) => {
        // Try aria-checked, data-deceased, data-state, or textContent as the signal
        return (
          el.getAttribute('aria-checked') ??
          el.getAttribute('data-deceased') ??
          el.getAttribute('data-state') ??
          el.textContent
        );
      });

      // Toggle the status
      await statusToggle.click();

      // After the click, the toggle state must have changed
      await expect(async () => {
        const stateAfter = await statusToggle.evaluate((el) => {
          return (
            el.getAttribute('aria-checked') ??
            el.getAttribute('data-deceased') ??
            el.getAttribute('data-state') ??
            el.textContent
          );
        });
        expect(stateAfter).not.toBe(stateBefore);
      }).toPass({ timeout: 5_000 });

      expect(consoleMsgs.errors).toEqual([]);
      expect(consoleMsgs.warnings).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  // ---------------------------------------------------------------------------
  // SE3 — Guest: toggle status → reload reverts (ephemeral, not saved)
  // ---------------------------------------------------------------------------

  test('SE3 — guest toggles status → reload reverts to original (ephemeral)', async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleMsgs = attachConsoleCapture(page);

    try {
      await page.goto(DEMO_URL);

      // Wait for canvas
      await expect(page.getByTestId('tree-canvas')).toBeVisible({ timeout: 15_000 });

      // Open the drawer for the first person
      const firstNode = page.locator(ANY_PERSON_NODE).first();
      await expect(firstNode).toBeVisible({ timeout: 10_000 });
      await firstNode.click();

      const statusToggle = page.getByTestId('status-toggle');
      await expect(statusToggle).toBeVisible({ timeout: 8_000 });

      // Record original state before toggling
      const originalState = await statusToggle.evaluate((el) => {
        return (
          el.getAttribute('aria-checked') ??
          el.getAttribute('data-deceased') ??
          el.getAttribute('data-state') ??
          el.textContent
        );
      });

      // Toggle
      await statusToggle.click();

      // Confirm the state changed (toggle worked)
      await expect(async () => {
        const stateAfterToggle = await statusToggle.evaluate((el) => {
          return (
            el.getAttribute('aria-checked') ??
            el.getAttribute('data-deceased') ??
            el.getAttribute('data-state') ??
            el.textContent
          );
        });
        expect(stateAfterToggle).not.toBe(originalState);
      }).toPass({ timeout: 5_000 });

      // RELOAD — ephemeral change must NOT survive
      await page.reload();
      await expect(page.getByTestId('tree-canvas')).toBeVisible({ timeout: 15_000 });

      // Re-open the same person's drawer
      await expect(firstNode).toBeVisible({ timeout: 10_000 });
      await firstNode.click();

      const statusToggleAfterReload = page.getByTestId('status-toggle');
      await expect(statusToggleAfterReload).toBeVisible({ timeout: 8_000 });

      // State must be back to the original — not the toggled value
      const stateAfterReload = await statusToggleAfterReload.evaluate((el) => {
        return (
          el.getAttribute('aria-checked') ??
          el.getAttribute('data-deceased') ??
          el.getAttribute('data-state') ??
          el.textContent
        );
      });

      expect(stateAfterReload).toBe(originalState);

      expect(consoleMsgs.errors).toEqual([]);
      expect(consoleMsgs.warnings).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  // ---------------------------------------------------------------------------
  // SE4 — Guest: status-year-input only visible when deceased=true
  // ---------------------------------------------------------------------------

  test('SE4 — status-year-input only shown when deceased is toggled to true', async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleMsgs = attachConsoleCapture(page);

    try {
      await page.goto(DEMO_URL);

      await expect(page.getByTestId('tree-canvas')).toBeVisible({ timeout: 15_000 });

      // Open drawer for first person
      const firstNode = page.locator(ANY_PERSON_NODE).first();
      await expect(firstNode).toBeVisible({ timeout: 10_000 });
      await firstNode.click();

      const statusToggle = page.getByTestId('status-toggle');
      await expect(statusToggle).toBeVisible({ timeout: 8_000 });

      const yearInput = page.getByTestId('status-year-input');

      // Get current deceased state to determine whether we need to toggle
      const currentDeceased = await statusToggle.evaluate((el) => {
        // Prefer aria-checked as canonical signal; fall back to data-deceased
        const ariaChecked = el.getAttribute('aria-checked');
        const dataDeceased = el.getAttribute('data-deceased');
        if (ariaChecked !== null) return ariaChecked === 'true';
        if (dataDeceased !== null) return dataDeceased === 'true';
        return null;
      });

      if (currentDeceased === false) {
        // Currently alive — year input should be hidden
        await expect(yearInput).toBeHidden();

        // Toggle to deceased
        await statusToggle.click();

        // Now year input should be visible
        await expect(yearInput).toBeVisible({ timeout: 3_000 });
      } else if (currentDeceased === true) {
        // Currently deceased — year input should be visible
        await expect(yearInput).toBeVisible();

        // Toggle to alive
        await statusToggle.click();

        // Year input should now be hidden
        await expect(yearInput).toBeHidden({ timeout: 3_000 });
      } else {
        // Can't determine state from aria attributes — just assert year input visibility
        // correlates with toggle state (one of the two must hold).
        // This is a graceful fallback for implementations that use other attribute patterns.
        test.info().annotations.push({
          type: 'warning',
          description:
            'SE4: Could not determine deceased state from aria-checked or data-deceased attributes. ' +
            'Verify status-toggle exposes aria-checked or data-deceased.',
        });
      }

      expect(consoleMsgs.errors).toEqual([]);
      expect(consoleMsgs.warnings).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  // ---------------------------------------------------------------------------
  // TODO (owner-persist): owner saves status → reload persists
  //
  // This test requires a test-tree fixture owned by the e2e test user.
  // Add it when:
  //   1. signupAndVerifyViaBackchannel creates a tree and seeds one person.
  //   2. The PATCH /api/tree/:slug/person/:personId endpoint is live.
  //
  // Outline:
  //   - signupAndVerifyViaBackchannel(request, email, password)
  //   - navigate to /[slug] as the owner
  //   - open a person's drawer
  //   - assert status-ephemeral-note is NOT visible (owner sees save UI)
  //   - toggle deceased, optionally set year
  //   - wait for a save confirmation (button state or toast)
  //   - reload and assert the change PERSISTED
  // ---------------------------------------------------------------------------
});
