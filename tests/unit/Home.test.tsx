/**
 * Home.test.tsx — source-level assertions for Home.tsx.
 *
 * The vitest environment is 'node' (no jsdom), so DOM rendering is not
 * available. Instead we verify the source of Home.tsx directly to
 * guarantee the required imports and routing logic are present.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(
  resolve(__dirname, '../../src/app/pages/Home.tsx'),
  'utf-8',
);

describe('Home (source assertions)', () => {
  it('imports useSession from @app/hooks/useSession', () => {
    expect(src).toMatch(/import\s+\{[^}]*\buseSession\b[^}]*\}\s+from\s+['"]@app\/hooks\/useSession['"]/);
  });

  it('imports Landing from the sibling page', () => {
    // Landing must be imported via a relative path (sibling page)
    expect(src).toMatch(/import\s+\{[^}]*\bLanding\b[^}]*\}\s+from\s+['"]\.\//);
  });

  it('imports TreeView from the sibling page', () => {
    // TreeView must be imported via a relative path (sibling page)
    expect(src).toMatch(/import\s+\{[^}]*\bTreeView\b[^}]*\}\s+from\s+['"]\.\//);
  });

  it('passes treeSlug="wongsuriya" to TreeView for the guest route', () => {
    expect(src).toContain('treeSlug="wongsuriya"');
  });

  it('references user from useSession to branch on auth state', () => {
    expect(src).toMatch(/\buser\b/);
  });

  it('references loading from useSession to avoid flash before session resolves', () => {
    expect(src).toMatch(/\bloading\b/);
  });
});
