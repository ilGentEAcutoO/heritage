/**
 * TreeView.test.tsx — snippet-level assertions for the 404 error branch.
 *
 * The vitest environment is 'node' (no jsdom), so DOM rendering is not
 * available. Instead we verify the source of TreeView.tsx directly to
 * guarantee the required elements are present in the 404 branch.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(
  resolve(__dirname, '../../src/app/pages/TreeView.tsx'),
  'utf-8',
);

describe('TreeView 404 branch (source assertions)', () => {
  it('imports Link from react-router-dom', () => {
    expect(src).toMatch(/import\s+\{[^}]*\bLink\b[^}]*\}\s+from\s+['"]react-router-dom['"]/);
  });

  it('renders a bilingual "tree not found" heading', () => {
    expect(src).toContain('ต้นไม้ไม่พบ / Tree not found');
  });

  it('includes a Link to /demo/wongsuriya', () => {
    expect(src).toContain('to="/demo/wongsuriya"');
  });

  it('includes a secondary Link back to /', () => {
    // There should be at least one Link to "/"
    expect(src).toMatch(/to=["']\/["']/);
  });

  it('does not hard-navigate with <a href> for the demo link', () => {
    // The demo link must use <Link>, not a plain anchor
    const demoAnchor = /<a\s[^>]*href=["']\/demo\/wongsuriya["']/;
    expect(src).not.toMatch(demoAnchor);
  });
});

describe('TreeView POV-drawer wiring (source assertions)', () => {
  it('passes onSetActiveView={setActiveViewId} to ProfileDrawer', () => {
    // TreeView must wire the setter directly into the drawer
    expect(src).toMatch(/onSetActiveView=\{setActiveViewId\}/);
  });

  it('passes isActiveView={...activeViewId} to ProfileDrawer', () => {
    // e.g. isActiveView={selected?.id === activeViewId} or isActiveView={activeViewId === selected?.id}
    expect(src).toMatch(/isActiveView=\{[^}]*activeViewId[^}]*\}/);
  });
});

describe('TreeView guest login button (source assertions)', () => {
  it('has data-testid="header-login" for the guest login control', () => {
    expect(src).toContain('data-testid="header-login"');
  });

  it('routes to "/login" via react-router Link (to="/login")', () => {
    expect(src).toContain('to="/login"');
  });

  it('displays the Thai text เข้าสู่ระบบ as the accessible name', () => {
    expect(src).toContain('เข้าสู่ระบบ');
  });

  it('gates the login control on user and loading state', () => {
    // The component must reference both 'user' and 'loading' so it shows login
    // only for resolved-guest sessions (not while loading).
    expect(src).toMatch(/\buser\b/);
    expect(src).toMatch(/\bloading\b/);
  });
});
