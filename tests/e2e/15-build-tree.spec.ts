/**
 * 15-build-tree.spec.ts — Workstream 09 Stage 2: build-tree e2e.
 *
 * Runs against the deployed production URL (or local dev via baseURL in playwright.config).
 *
 * Flow:
 *   BT1 — signup + create a new owner tree via the UI
 *   BT2 — owner adds a person via "+ เพิ่มคน" button + AddPersonDialog
 *   BT3 — added person appears (sidebar count rises / node visible)
 *   BT4 — owner edits the person (แก้ไข → change born → save) → asserts persists after reload
 *   BT5 — owner deletes the person → asserts gone after reload
 *
 * Contract testids (ws09 Stage 2):
 *   add-person-button    — the "+ เพิ่มคน" button in the sidebar
 *   add-person-name      — name field in AddPersonDialog
 *   add-person-submit    — submit button in AddPersonDialog
 *   edit-person-toggle   — "แก้ไข" toggle in ProfileDrawer (owner only)
 *   edit-person-*        — editable fields in edit mode (e.g. edit-person-born)
 *   edit-person-save     — save button in edit mode
 *   delete-person-button — "ลบคนนี้" button in ProfileDrawer (owner only)
 *
 * Global teardown purges:
 *   - trees with slug LIKE 'e2e-%'
 *   - users e2e-%@example.com
 */

import { test, expect } from '@playwright/test';
import { attachConsoleCapture } from './helpers/console';
import { makeE2EEmail, signupAndVerifyViaBackchannel } from './helpers/signup';

test.describe.configure({ mode: 'serial' });

// Selector for any person node on the canvas.
const ANY_PERSON_NODE = '[data-person]';

test.describe('Build tree — owner CRUD', () => {
  // Shared state across serial tests
  let treeSlug: string;
  let treeUrl: string;
  let addedPersonName: string;

  // ---------------------------------------------------------------------------
  // BT1 — signup + create a tree
  // ---------------------------------------------------------------------------
  test('BT1 — signup as new owner, create a tree via UI, land on /tree/:slug', async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleMsgs = attachConsoleCapture(page);

    const email = makeE2EEmail('bt');
    const password = 'correctHorseBatteryStaple12';
    treeSlug = `e2e-build-${Date.now()}`;
    treeUrl = `/tree/${treeSlug}`;
    const treeName = 'ครอบครัว BT Test';

    try {
      await signupAndVerifyViaBackchannel(ctx.request, email, password, 'BT Owner');

      await page.goto('/trees');

      // Open the create dialog
      await page.getByTestId('create-tree-button').click();
      await expect(page.getByTestId('create-tree-dialog')).toBeVisible({ timeout: 10_000 });

      // Fill name + slug, submit
      await page.getByTestId('create-tree-name').fill(treeName);
      await page.getByTestId('create-tree-slug').fill(treeSlug);
      await page.getByTestId('create-tree-submit').click();

      // Lands on the new tree
      await expect(page).toHaveURL(new RegExp(`/tree/${treeSlug}$`), { timeout: 15_000 });

      // Tree canvas should be visible
      await expect(page.getByTestId('tree-canvas')).toBeVisible({ timeout: 15_000 });

      expect(consoleMsgs.errors, `console errors: ${consoleMsgs.errors.join(' | ')}`).toEqual([]);
      expect(consoleMsgs.warnings, `console warnings: ${consoleMsgs.warnings.join(' | ')}`).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  // ---------------------------------------------------------------------------
  // BT2+BT3 — owner adds a person via the UI, person appears on canvas
  // ---------------------------------------------------------------------------
  test('BT2+BT3 — owner clicks "+ เพิ่มคน", fills dialog, submits, person appears', async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleMsgs = attachConsoleCapture(page);

    const email = makeE2EEmail('bt2');
    const password = 'correctHorseBatteryStaple12';
    addedPersonName = 'สมชาย BT';

    try {
      await signupAndVerifyViaBackchannel(ctx.request, email, password, 'BT Owner 2');

      // Create the tree fresh for this test context
      treeSlug = `e2e-build-${Date.now()}`;
      treeUrl = `/tree/${treeSlug}`;
      const treeName = 'ครอบครัว BT2 Test';

      await page.goto('/trees');
      await page.getByTestId('create-tree-button').click();
      await expect(page.getByTestId('create-tree-dialog')).toBeVisible({ timeout: 10_000 });
      await page.getByTestId('create-tree-name').fill(treeName);
      await page.getByTestId('create-tree-slug').fill(treeSlug);
      await page.getByTestId('create-tree-submit').click();
      await expect(page).toHaveURL(new RegExp(`/tree/${treeSlug}$`), { timeout: 15_000 });
      await expect(page.getByTestId('tree-canvas')).toBeVisible({ timeout: 15_000 });

      // The add-person-button should be visible (owner sees it)
      const addPersonBtn = page.getByTestId('add-person-button');
      await expect(addPersonBtn).toBeVisible({ timeout: 10_000 });

      // Count person nodes before adding
      const nodesBefore = await page.locator(ANY_PERSON_NODE).count();

      // Click the add person button to open dialog
      await addPersonBtn.click();

      // Dialog should appear — fill name
      const nameInput = page.getByTestId('add-person-name');
      await expect(nameInput).toBeVisible({ timeout: 10_000 });
      await nameInput.fill(addedPersonName);
      // A birth year is required for placement on the generational canvas
      // (born-less people are findable in the sidebar but not laid out on the tree).
      await page.getByTestId('add-person-born').fill('1950');

      // Submit
      const submitBtn = page.getByTestId('add-person-submit');
      await expect(submitBtn).toBeVisible({ timeout: 5_000 });
      await submitBtn.click();

      // Person node should appear on canvas — count should increase
      await expect(async () => {
        const nodesAfter = await page.locator(ANY_PERSON_NODE).count();
        expect(nodesAfter).toBeGreaterThan(nodesBefore);
      }).toPass({ timeout: 15_000 });

      // Alternatively, verify the person name appears somewhere visible
      await expect(page.getByText(addedPersonName)).toBeVisible({ timeout: 10_000 });

      expect(consoleMsgs.errors, `console errors: ${consoleMsgs.errors.join(' | ')}`).toEqual([]);
      expect(consoleMsgs.warnings, `console warnings: ${consoleMsgs.warnings.join(' | ')}`).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  // ---------------------------------------------------------------------------
  // BT4 — owner edits person (born year), save persists after reload
  // ---------------------------------------------------------------------------
  test('BT4 — owner edits person born year, save, reload → change persists', async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleMsgs = attachConsoleCapture(page);

    const email = makeE2EEmail('bt4');
    const password = 'correctHorseBatteryStaple12';
    const personName = 'สมหญิง BT4';
    const newBornYear = '1985';

    try {
      await signupAndVerifyViaBackchannel(ctx.request, email, password, 'BT4 Owner');

      // Create tree
      const slug = `e2e-build-${Date.now()}`;
      const treeName = 'ครอบครัว BT4 Test';

      await page.goto('/trees');
      await page.getByTestId('create-tree-button').click();
      await expect(page.getByTestId('create-tree-dialog')).toBeVisible({ timeout: 10_000 });
      await page.getByTestId('create-tree-name').fill(treeName);
      await page.getByTestId('create-tree-slug').fill(slug);
      await page.getByTestId('create-tree-submit').click();
      await expect(page).toHaveURL(new RegExp(`/tree/${slug}$`), { timeout: 15_000 });
      await expect(page.getByTestId('tree-canvas')).toBeVisible({ timeout: 15_000 });

      // Add a person
      const addPersonBtn = page.getByTestId('add-person-button');
      await expect(addPersonBtn).toBeVisible({ timeout: 10_000 });
      await addPersonBtn.click();

      const nameInput = page.getByTestId('add-person-name');
      await expect(nameInput).toBeVisible({ timeout: 10_000 });
      await nameInput.fill(personName);
      // born year → placeable on the generational canvas (so the node is clickable)
      await page.getByTestId('add-person-born').fill('1950');
      await page.getByTestId('add-person-submit').click();

      // Wait for person to appear on canvas
      await expect(page.getByText(personName)).toBeVisible({ timeout: 15_000 });

      // Click the person node to open ProfileDrawer
      const personNode = page.locator(ANY_PERSON_NODE).first();
      await expect(personNode).toBeVisible({ timeout: 10_000 });
      await personNode.click();

      // Owner should see edit-person-toggle
      const editToggle = page.getByTestId('edit-person-toggle');
      await expect(editToggle).toBeVisible({ timeout: 10_000 });
      await editToggle.click();

      // Edit fields should appear — fill in born year
      const bornInput = page.getByTestId('edit-person-born');
      await expect(bornInput).toBeVisible({ timeout: 8_000 });
      await bornInput.clear();
      await bornInput.fill(newBornYear);

      // Save
      const saveBtn = page.getByTestId('edit-person-save');
      await expect(saveBtn).toBeVisible({ timeout: 5_000 });
      await saveBtn.click();

      // Wait for save to complete (save button may disappear / drawer may update)
      await expect(async () => {
        // After save, the born year should appear somewhere in the drawer/UI
        const pageText = await page.content();
        expect(pageText).toContain(newBornYear);
      }).toPass({ timeout: 10_000 });

      // Reload the page
      await page.goto(`/tree/${slug}`);
      await expect(page.getByTestId('tree-canvas')).toBeVisible({ timeout: 15_000 });

      // Re-open the person's drawer
      const personNodeAfterReload = page.locator(ANY_PERSON_NODE).first();
      await expect(personNodeAfterReload).toBeVisible({ timeout: 10_000 });
      await personNodeAfterReload.click();

      // The born year should still be present after reload
      await expect(async () => {
        const pageText = await page.content();
        expect(pageText).toContain(newBornYear);
      }).toPass({ timeout: 10_000 });

      expect(consoleMsgs.errors, `console errors: ${consoleMsgs.errors.join(' | ')}`).toEqual([]);
      expect(consoleMsgs.warnings, `console warnings: ${consoleMsgs.warnings.join(' | ')}`).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  // ---------------------------------------------------------------------------
  // BT5 — owner deletes person, reload → person is gone
  // ---------------------------------------------------------------------------
  test('BT5 — owner deletes person, reload → person gone from canvas', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleMsgs = attachConsoleCapture(page);

    const email = makeE2EEmail('bt5');
    const password = 'correctHorseBatteryStaple12';
    const personName = 'สมศักดิ์ BT5';

    try {
      await signupAndVerifyViaBackchannel(ctx.request, email, password, 'BT5 Owner');

      // Create tree
      const slug = `e2e-build-${Date.now()}`;
      const treeName = 'ครอบครัว BT5 Test';

      await page.goto('/trees');
      await page.getByTestId('create-tree-button').click();
      await expect(page.getByTestId('create-tree-dialog')).toBeVisible({ timeout: 10_000 });
      await page.getByTestId('create-tree-name').fill(treeName);
      await page.getByTestId('create-tree-slug').fill(slug);
      await page.getByTestId('create-tree-submit').click();
      await expect(page).toHaveURL(new RegExp(`/tree/${slug}$`), { timeout: 15_000 });
      await expect(page.getByTestId('tree-canvas')).toBeVisible({ timeout: 15_000 });

      // Add a person
      const addPersonBtn = page.getByTestId('add-person-button');
      await expect(addPersonBtn).toBeVisible({ timeout: 10_000 });
      await addPersonBtn.click();

      const nameInput = page.getByTestId('add-person-name');
      await expect(nameInput).toBeVisible({ timeout: 10_000 });
      await nameInput.fill(personName);
      // born year → placeable on the generational canvas (so the node is clickable)
      await page.getByTestId('add-person-born').fill('1950');
      await page.getByTestId('add-person-submit').click();

      // Wait for person to appear
      await expect(page.getByText(personName)).toBeVisible({ timeout: 15_000 });

      // Count nodes before delete
      const nodesBeforeDelete = await page.locator(ANY_PERSON_NODE).count();
      expect(nodesBeforeDelete).toBeGreaterThan(0);

      // Click the person node to open ProfileDrawer
      const personNode = page.locator(ANY_PERSON_NODE).first();
      await expect(personNode).toBeVisible({ timeout: 10_000 });
      await personNode.click();

      // Click the delete button
      const deleteBtn = page.getByTestId('delete-person-button');
      await expect(deleteBtn).toBeVisible({ timeout: 10_000 });
      await deleteBtn.click();

      // Confirm deletion if a confirm step appears
      // Try common confirm patterns: another delete button, or a confirm button
      const confirmDelete = page.getByTestId('delete-person-button').or(
        page.getByRole('button', { name: /ยืนยัน|ลบ|confirm|delete/i }),
      );
      // Wait briefly — if a second confirm appears, click it
      const confirmVisible = await confirmDelete.first().isVisible({ timeout: 3_000 }).catch(() => false);
      if (confirmVisible) {
        // Click the second time to confirm (skip if it was already the first delete)
        const allDeleteBtns = page.getByTestId('delete-person-button');
        const count = await allDeleteBtns.count();
        if (count > 0) {
          // Only click again if there's a confirm-specific button separate from delete
          const confirmOnlyBtn = page.getByRole('button', { name: /ยืนยัน|confirm/i });
          const hasConfirm = await confirmOnlyBtn.isVisible({ timeout: 2_000 }).catch(() => false);
          if (hasConfirm) {
            await confirmOnlyBtn.click();
          }
        }
      }

      // Person node count should decrease
      await expect(async () => {
        const nodesAfterDelete = await page.locator(ANY_PERSON_NODE).count();
        expect(nodesAfterDelete).toBeLessThan(nodesBeforeDelete);
      }).toPass({ timeout: 15_000 });

      // Reload the page
      await page.goto(`/tree/${slug}`);
      await expect(page.getByTestId('tree-canvas')).toBeVisible({ timeout: 15_000 });

      // Person should not be visible after reload
      await expect(page.getByText(personName)).toHaveCount(0, { timeout: 10_000 });

      // Node count should remain reduced
      const nodesAfterReload = await page.locator(ANY_PERSON_NODE).count();
      expect(nodesAfterReload).toBeLessThan(nodesBeforeDelete);

      expect(consoleMsgs.errors, `console errors: ${consoleMsgs.errors.join(' | ')}`).toEqual([]);
      expect(consoleMsgs.warnings, `console warnings: ${consoleMsgs.warnings.join(' | ')}`).toEqual([]);
    } finally {
      await ctx.close();
    }
  });
});
