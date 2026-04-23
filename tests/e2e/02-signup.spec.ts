/**
 * 02-signup.spec.ts — S3 (valid signup) + S4 (short password rejected client-side).
 */

import { test, expect } from '@playwright/test';
import { attachConsoleCapture } from './helpers/console';
import { makeE2EEmail } from './helpers/signup';

test.describe.configure({ mode: 'serial' });

test.describe('Signup', () => {
  test('S3 — valid signup shows check-inbox copy, API returns 201', async ({ page }) => {
    const consoleMsgs = attachConsoleCapture(page);
    const email = makeE2EEmail('s3');

    // Capture the signup network call to verify 201
    const signupPromise = page.waitForResponse(
      (res) => res.url().endsWith('/api/auth/signup') && res.request().method() === 'POST',
    );

    await page.goto('/signup');
    await page.getByLabel('อีเมล').fill(email);
    await page.getByLabel('รหัสผ่าน').fill('correctHorseBatteryStaple12');
    await page.getByRole('button', { name: /สมัครสมาชิก/ }).click();

    const signupRes = await signupPromise;
    expect(signupRes.status()).toBe(201);

    // Success copy appears after submit
    await expect(page.getByText(/ตรวจสอบกล่องจดหมายของคุณ/)).toBeVisible();

    expect(consoleMsgs.errors).toEqual([]);
    expect(consoleMsgs.warnings).toEqual([]);
  });

  test('S4 — short password blocks submit client-side; no POST fires', async ({ page }) => {
    const consoleMsgs = attachConsoleCapture(page);
    let postFired = false;
    page.on('request', (req) => {
      if (req.url().endsWith('/api/auth/signup') && req.method() === 'POST') {
        postFired = true;
      }
    });

    const email = makeE2EEmail('s4');

    await page.goto('/signup');

    // The <input minLength={12}> will block form submission at the browser
    // level, never firing a POST. The form uses an HTML-native minLength, so
    // the browser's constraint-validation UI kicks in before handleSubmit runs.
    //
    // For this spec, we bypass HTML5 validation by submitting an 8-char pw via
    // DOM — the component's JS-level check also triggers and shows a Thai
    // error message. We verify that POST never fires.

    await page.getByLabel('อีเมล').fill(email);

    // Focus password and type 8 chars. Then trigger submit via JS because the
    // native submit would be blocked by minLength.
    const pwInput = page.locator('#signup-password');
    await pwInput.fill('shortpw1'); // 8 chars

    // Remove the `minLength` attribute so the JS handler runs and sets error.
    await pwInput.evaluate((el: HTMLInputElement) => {
      el.removeAttribute('minLength');
      el.removeAttribute('minlength');
    });

    await page.getByRole('button', { name: /สมัครสมาชิก/ }).click();

    // Expect the Thai min-length error message
    await expect(page.getByText(/รหัสผ่านต้องมีอย่างน้อย 12 ตัวอักษร/)).toBeVisible();

    // No POST should have fired
    await page.waitForTimeout(500);
    expect(postFired, 'signup POST must not fire for short password').toBe(false);

    expect(consoleMsgs.errors).toEqual([]);
    expect(consoleMsgs.warnings).toEqual([]);
  });
});
