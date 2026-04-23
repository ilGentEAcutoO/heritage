/**
 * global-teardown.ts — runs once after all specs finish.
 * Purges every e2e-scoped row so re-runs start from a clean slate.
 */

import { purgeE2EUsers, purgeE2ETrees } from './cleanup';

export default async function globalTeardown() {
  try {
    console.log('[e2e] global teardown — purging e2e-% rows…');
    purgeE2ETrees();
    purgeE2EUsers();
    console.log('[e2e] teardown complete.');
  } catch (err) {
    console.error('[e2e] teardown failed (not fatal):', err);
  }
}
