/**
 * cleanup-cli.ts — thin CLI wrapper; invokes cleanup helpers for
 * `pnpm e2e:cleanup`.
 */

import { purgeE2EUsers, purgeE2ETrees } from './cleanup';

(function main() {
  console.log('[e2e:cleanup] purging e2e-%@example.com users and e2e-% trees from prod D1…');
  purgeE2ETrees();
  purgeE2EUsers();
  console.log('[e2e:cleanup] done.');
})();
