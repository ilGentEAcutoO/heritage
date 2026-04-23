/**
 * console.ts — attach a console-error/warning collector to a Page.
 *
 * Usage in a spec:
 *
 *   test('scenario', async ({ page }) => {
 *     const consoleMsgs = attachConsoleCapture(page);
 *     // ... interact
 *     expect(consoleMsgs.errors).toEqual([]);
 *     expect(consoleMsgs.warnings).toEqual([]);
 *   });
 */

import type { Page } from '@playwright/test';

export interface ConsoleCapture {
  errors: string[];
  warnings: string[];
}

/**
 * Some noisy messages come from third-party embeds or the browser itself and
 * are not actionable. Extend this list only with strong justification.
 */
const IGNORED_SUBSTRINGS: string[] = [
  // React DevTools nag in production
  'Download the React DevTools',
  // Source-map fetch 404 from Vite dev artefacts that shipped to prod
  'DevTools failed to load source map',
  // Chrome emits a resource-load error for every fetch 4xx/5xx. Our /api/auth/me
  // endpoint INTENTIONALLY returns 401 when no session exists (that IS the
  // protocol — anon users get 401, not 200 {user: null}). The console message
  // is automatic Chrome noise, not a bug.
  'the server responded with a status of 401',
  // Same rationale for 404 from bogus-slug fetches (S13 uses this deliberately).
  'the server responded with a status of 404',
];

function shouldIgnore(text: string): boolean {
  return IGNORED_SUBSTRINGS.some((s) => text.includes(s));
}

export function attachConsoleCapture(page: Page): ConsoleCapture {
  const capture: ConsoleCapture = { errors: [], warnings: [] };

  page.on('console', (msg) => {
    const text = msg.text();
    if (shouldIgnore(text)) return;
    if (msg.type() === 'error') capture.errors.push(text);
    else if (msg.type() === 'warning') capture.warnings.push(text);
  });

  page.on('pageerror', (err) => {
    const text = `[pageerror] ${err.message}`;
    if (shouldIgnore(text)) return;
    capture.errors.push(text);
  });

  return capture;
}
