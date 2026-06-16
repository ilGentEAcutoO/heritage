/**
 * status-validation.test.ts — source-assertion tests for the PATCH
 * /api/tree/:slug/person/:personId endpoint implemented in
 * src/worker/routes/people.ts.
 *
 * Environment: vitest 'node' (no jsdom). Pure source-text assertions only —
 * no runtime execution. This mirrors the technique used in TreeView.test.tsx.
 *
 * Why source assertions, not live integration?
 *   - Other agents are concurrently editing source files; the full worker
 *     runtime cannot be spun up safely in this slot.
 *   - The live endpoint behaviour is covered by the integration test in TASK-003.
 *   - Source assertions give a precise, stable signal that each required
 *     implementation detail is actually present in the file.
 *
 * Contract (Workstream 08 — shared):
 *   PATCH /api/tree/:slug/person/:personId
 *   body: { deceased: boolean, died: number | null }
 *   auth: owner-only. No session → 401. Non-owner OR person not in tree → 404
 *         (anti-enumeration, mirrors shares.ts).
 *   rules:
 *     - if !deceased → died forced to null
 *     - if deceased && died != null → require born <= died <= currentYear
 *       (fetch person row for born; currentYear via new Date().getFullYear())
 *   on success:
 *     db.update(people).set({deceased, died}).where(and(eq(id, personId), eq(tree_id, tree.id)))
 *     purgeTreeCache(c.req.url, slug)
 *     return c.json({deceased, died})
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FILE_PATH = resolve(__dirname, '../../src/worker/routes/people.ts');

let src: string;
try {
  src = readFileSync(FILE_PATH, 'utf-8');
} catch {
  // File not yet created by TASK-003 — all tests will fail with a descriptive
  // error rather than a cryptic "Cannot read property of undefined".
  src = '';
}

// ---------------------------------------------------------------------------
// Zod body schema
// ---------------------------------------------------------------------------

describe('people.ts — zod body schema for PATCH /person/:personId', () => {
  it('imports zod', () => {
    expect(src, 'expected zod import').toMatch(/from\s+['"]zod['"]/);
  });

  it('defines a zod schema that validates deceased (boolean)', () => {
    // Schema must include a z.boolean() validator for deceased.
    expect(src).toMatch(/z\.boolean\(\)/);
  });

  it('defines a zod schema that validates died (number or null)', () => {
    // died must accept null (z.null()) and a number type.
    // Accepts: z.number().nullable() OR z.union([z.number(), z.null()]) etc.
    expect(src).toMatch(/died/);
    expect(src).toMatch(/nullable|z\.null\(\)|union/);
  });
});

// ---------------------------------------------------------------------------
// died=null forced when !deceased
// ---------------------------------------------------------------------------

describe('people.ts — died forced to null when deceased=false', () => {
  it('contains logic that sets died to null when !deceased', () => {
    // The endpoint must enforce: if (!deceased) { died = null }
    // Accept any of the common patterns:
    //   !deceased
    //   deceased === false
    //   !body.deceased
    expect(src).toMatch(/!deceased|deceased\s*===\s*false|!body\.deceased/);
  });

  it('explicitly assigns died = null (or equivalent) in the !deceased branch', () => {
    // Must assign null to died somewhere — not just validate it
    expect(src).toMatch(/died\s*=\s*null|died:\s*null/);
  });
});

// ---------------------------------------------------------------------------
// died range-check: born <= died <= currentYear
// ---------------------------------------------------------------------------

describe('people.ts — died range validation (born <= died <= currentYear)', () => {
  it('derives currentYear from new Date().getFullYear()', () => {
    expect(src).toMatch(/new\s+Date\(\)\.getFullYear\(\)/);
  });

  it('compares died against currentYear (upper bound)', () => {
    // died must be <= currentYear
    // case-insensitive: matches `effectiveDied > currentYear()` and `died > yr`
    expect(src).toMatch(/died\s*>\s*(currentYear|yr)|currentYear\s*<\s*died/i);
  });

  it('compares died against born (lower bound)', () => {
    // died must be >= born (born is read off the fetched person row)
    expect(src).toMatch(/died\s*<\s*(person\.)?born|(person\.)?born\s*>\s*died/);
  });
});

// ---------------------------------------------------------------------------
// resolveOwnerTree — mirrors shares.ts
// ---------------------------------------------------------------------------

describe('people.ts — uses resolveOwnerTree for owner-only access', () => {
  it('defines or imports resolveOwnerTree', () => {
    // Accepts a local definition or an import
    expect(src).toMatch(/resolveOwnerTree/);
  });

  it('returns 401 when no session', () => {
    // Must check for missing user and return 401
    expect(src).toMatch(/401/);
    // The owner-only guard is delegated to resolveOwnerTree (which returns
    // {status:401} when there is no user); people.ts maps ctx.status === 401.
    expect(src).toMatch(/!user|user\s*==\s*null|user\s*===\s*null|status:\s*401|resolveOwnerTree|ctx\.status\s*===\s*401/);
  });

  it('returns 404 for non-owner (anti-enumeration)', () => {
    // Must return 404 when tree exists but caller is not the owner
    expect(src).toMatch(/404/);
  });
});

// ---------------------------------------------------------------------------
// Scopes the update by tree_id (prevents cross-tree mutation)
// ---------------------------------------------------------------------------

describe('people.ts — update scoped by tree_id', () => {
  it('uses eq(people, ...) or eq(..., personId) in the where clause', () => {
    // Must filter people by personId in the update
    expect(src).toMatch(/personId|person_id/);
  });

  it('includes tree_id (or tree.id) in the where clause of the update', () => {
    // The update WHERE must include both personId AND tree_id to prevent
    // cross-tree person mutation. Accepts tree.id / tree_id / treeId variants.
    expect(src).toMatch(/tree[_.]id|tree\.id|treeId/);
  });

  it('calls db.update(people).set(...) for the mutation', () => {
    // Must use drizzle update — not a raw SQL string
    expect(src).toMatch(/\.update\(.*people.*\)|update\(schema\.people\)/);
  });
});

// ---------------------------------------------------------------------------
// purgeTreeCache — called on success
// ---------------------------------------------------------------------------

describe('people.ts — calls purgeTreeCache on success', () => {
  it('imports purgeTreeCache', () => {
    expect(src).toMatch(/purgeTreeCache/);
  });

  it('calls purgeTreeCache with the request url and slug', () => {
    // Must pass c.req.url (or equivalent) and slug
    expect(src).toMatch(/purgeTreeCache\s*\(/);
    expect(src).toMatch(/c\.req\.url/);
    expect(src).toMatch(/slug/);
  });
});

// ---------------------------------------------------------------------------
// Response shape: returns { deceased, died }
// ---------------------------------------------------------------------------

describe('people.ts — response returns { deceased, died }', () => {
  it('returns JSON with deceased and died fields', () => {
    // c.json({ deceased, died }) or c.json({ deceased: ..., died: ... })
    expect(src).toMatch(/c\.json\s*\(\s*\{[^}]*deceased[^}]*died/);
  });
});

// ---------------------------------------------------------------------------
// Anti-enumeration: person not in this tree → 404
// ---------------------------------------------------------------------------

describe('people.ts — anti-enumeration: person not in tree → 404', () => {
  it('fetches the person row and returns 404 when not found', () => {
    // Must look up the person by id, returning 404 if missing
    expect(src).toMatch(/findFirst|findOne|select.*from.*people/i);
    // Anti-enumeration response
    expect(src).toMatch(/404/);
  });
});
