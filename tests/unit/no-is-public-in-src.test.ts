/**
 * S2-T2 — Static assertion: no .ts file under src/ contains the substring 'is_public'.
 *
 * This is a "cleanliness" test: after TASK-S2 is complete, the deprecated
 * is_public column must be fully erased from production source code.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function gatherTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...gatherTsFiles(full));
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      results.push(full);
    }
  }
  return results;
}

describe('S2-T2 — no is_public in src/', () => {
  it('no .ts file under src/ contains the string "is_public"', () => {
    // Resolve src/ relative to the repo root (this file lives in tests/unit/)
    const srcDir = join(__dirname, '../../src');
    const tsFiles = gatherTsFiles(srcDir);

    const offenders: string[] = [];
    for (const file of tsFiles) {
      const content = readFileSync(file, 'utf-8');
      if (content.includes('is_public')) {
        offenders.push(file);
      }
    }

    expect(
      offenders,
      `These src/ files still reference 'is_public': ${offenders.join(', ')}`,
    ).toHaveLength(0);
  });
});
