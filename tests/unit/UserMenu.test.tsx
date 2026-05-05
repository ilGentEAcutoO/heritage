/**
 * UserMenu.test.tsx — source-level assertions for the UserMenu component.
 *
 * The vitest environment is 'node' (no jsdom), so DOM rendering is not
 * available. Instead we verify the source of UserMenu.tsx directly to
 * guarantee the required elements are present in the component source.
 *
 * NOTE: src/app/components/UserMenu.tsx does not exist yet (TDD).
 * readFileSync will throw ENOENT — that is the intended failing state.
 * This file will pass once TASK-003 implements the component.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(
  resolve(__dirname, '../../src/app/components/UserMenu.tsx'),
  'utf-8',
);

describe('UserMenu source-level assertions', () => {
  it('imports useSession from @app/hooks/useSession', () => {
    expect(src).toMatch(
      /import\s+\{[^}]*\buseSession\b[^}]*\}\s+from\s+['"]@app\/hooks\/useSession['"]/,
    );
  });

  it('imports Link from react-router-dom', () => {
    expect(src).toMatch(
      /import\s+\{[^}]*\bLink\b[^}]*\}\s+from\s+['"]react-router-dom['"]/,
    );
  });

  it('has a guest branch with a to="/login" Link', () => {
    expect(src).toContain('to="/login"');
  });

  it('has an authenticated branch with a to="/trees" Link', () => {
    expect(src).toContain('to="/trees"');
  });

  it('both branches include a to="/" (home) Link', () => {
    // Match at least one Link to "/"
    expect(src).toMatch(/to=["']\/["']/);
  });

  it('has a logout button calling logout()', () => {
    expect(src).toMatch(/logout\s*\(\s*\)/);
  });

  it('has aria-expanded AND aria-haspopup on trigger', () => {
    expect(src).toContain('aria-expanded');
    expect(src).toContain('aria-haspopup');
  });

  it('returns null when loading is true', () => {
    expect(src).toMatch(/if\s*\(\s*loading\s*\)\s*return\s+null/);
  });
});
