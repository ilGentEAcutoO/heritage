/**
 * mobile-nav.test.tsx — source-assertion tests for the mobile slide-out nav.
 *
 * The vitest environment is 'node' (no jsdom), so DOM rendering is not
 * available. Instead we verify the source of each file directly to guarantee
 * the required elements and patterns are present.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const treeViewSrc = readFileSync(
  resolve(__dirname, '../../src/app/pages/TreeView.tsx'),
  'utf-8',
);

const sidebarSrc = readFileSync(
  resolve(__dirname, '../../src/app/components/Sidebar.tsx'),
  'utf-8',
);

const stylesSrc = readFileSync(
  resolve(__dirname, '../../src/app/styles.css'),
  'utf-8',
);

// ─────── TreeView.tsx assertions ───────

describe('TreeView mobile nav (source assertions)', () => {
  it('renders the hamburger toggle with data-testid="nav-toggle"', () => {
    expect(treeViewSrc).toContain('data-testid="nav-toggle"');
  });

  it('has aria-label="เมนู" on the nav toggle', () => {
    expect(treeViewSrc).toContain('aria-label="เมนู"');
  });

  it('binds aria-expanded to navOpen state', () => {
    expect(treeViewSrc).toContain('aria-expanded');
    expect(treeViewSrc).toContain('navOpen');
  });

  it('sets aria-controls="sidebar-nav" on the toggle', () => {
    expect(treeViewSrc).toContain('aria-controls="sidebar-nav"');
  });

  it('declares navOpen useState', () => {
    expect(treeViewSrc).toMatch(/const\s+\[navOpen,\s*setNavOpen\]\s*=\s*useState/);
  });

  it('calls setNavOpen to open and close the drawer', () => {
    // Should reference setNavOpen at least twice: toggle open + close path
    const matches = treeViewSrc.match(/setNavOpen/g);
    expect(matches).not.toBeNull();
    expect((matches ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('renders nav-backdrop when navOpen is true', () => {
    expect(treeViewSrc).toContain('nav-backdrop');
  });

  it('passes navOpen (or open prop) down to Sidebar', () => {
    // TreeView must forward the open state to Sidebar
    expect(treeViewSrc).toMatch(/open=\{navOpen\}|open:\s*navOpen/);
  });

  it('closes nav on person select (setNavOpen(false))', () => {
    expect(treeViewSrc).toContain('setNavOpen(false)');
  });

  it('uses useEffect and keydown for ESC close', () => {
    expect(treeViewSrc).toContain('useEffect');
    expect(treeViewSrc).toMatch(/Escape|keydown/);
  });

  it('uses useRef for focus return to toggle', () => {
    expect(treeViewSrc).toContain('useRef');
  });
});

// ─────── Sidebar.tsx assertions ───────

describe('Sidebar mobile nav (source assertions)', () => {
  it('renders <aside> with id="sidebar-nav"', () => {
    expect(sidebarSrc).toContain('id="sidebar-nav"');
  });

  it('accepts an open prop in SidebarProps', () => {
    expect(sidebarSrc).toMatch(/open\??\s*:\s*boolean/);
  });

  it('applies the "open" class on the aside when open prop is true', () => {
    // The aside className should reference the open prop — e.g. via a ternary or template literal
    expect(sidebarSrc).toMatch(/open\s*\?.*['"]open['"]|sidebar.*open/);
  });
});

// ─────── styles.css assertions ───────

describe('styles.css mobile nav (source assertions)', () => {
  it('defines .nav-toggle (hidden by default)', () => {
    expect(stylesSrc).toContain('.nav-toggle');
  });

  it('defines .nav-backdrop', () => {
    expect(stylesSrc).toContain('.nav-backdrop');
  });

  it('defines .sidebar.open rule', () => {
    expect(stylesSrc).toContain('.sidebar.open');
  });

  it('uses translateX for off-canvas drawer animation', () => {
    expect(stylesSrc).toContain('translateX');
  });

  it('respects prefers-reduced-motion', () => {
    expect(stylesSrc).toContain('prefers-reduced-motion');
  });

  it('shows .nav-toggle inside the 820px media query', () => {
    // The toggle should be shown (display value other than none) inside @media (max-width: 820px)
    const mediaBlock = stylesSrc.match(/@media\s*\(max-width:\s*820px\)[^{]*\{([\s\S]*?)(?=@media|\s*$)/);
    expect(mediaBlock).not.toBeNull();
    if (mediaBlock) {
      expect(mediaBlock[1]).toMatch(/\.nav-toggle/);
    }
  });

  it('raises .app-header above backdrop in the 820px media query (z-index: 31)', () => {
    // Scoped to media query only — must not be on the global rule
    const mediaBlock = stylesSrc.match(/@media\s*\(max-width:\s*820px\)[^{]*\{([\s\S]*?)(?=@media|\s*$)/);
    expect(mediaBlock).not.toBeNull();
    if (mediaBlock) {
      expect(mediaBlock[1]).toContain('z-index: 31');
    }
  });

  it('offsets .nav-backdrop top to sit below the header (top: 58px)', () => {
    // Backdrop must not cover the header bar
    const mediaBlock = stylesSrc.match(/@media\s*\(max-width:\s*820px\)[^{]*\{([\s\S]*?)(?=@media|\s*$)/);
    expect(mediaBlock).not.toBeNull();
    if (mediaBlock) {
      expect(mediaBlock[1]).toMatch(/\.nav-backdrop[\s\S]*?top:\s*58px/);
    }
  });

  it('applies visibility:hidden to closed mobile sidebar (a11y: out of tab order)', () => {
    const mediaBlock = stylesSrc.match(/@media\s*\(max-width:\s*820px\)[^{]*\{([\s\S]*?)(?=@media|\s*$)/);
    expect(mediaBlock).not.toBeNull();
    if (mediaBlock) {
      expect(mediaBlock[1]).toContain('visibility: hidden');
    }
  });

  it('applies visibility:visible to open mobile sidebar', () => {
    const mediaBlock = stylesSrc.match(/@media\s*\(max-width:\s*820px\)[^{]*\{([\s\S]*?)(?=@media|\s*$)/);
    expect(mediaBlock).not.toBeNull();
    if (mediaBlock) {
      expect(mediaBlock[1]).toContain('visibility: visible');
    }
  });
});

// ─────── TreeView.tsx FIX 2 assertions ───────

describe('TreeView closeNav + open-focus (source assertions)', () => {
  it('defines a closeNav callback', () => {
    expect(treeViewSrc).toContain('closeNav');
  });

  it('calls .focus() on the toggle ref (focus return on close)', () => {
    expect(treeViewSrc).toContain('.focus()');
  });

  it('focuses the sidebar search input on open (querySelector)', () => {
    // The call is querySelector<HTMLElement>('input') — match the method + selector
    expect(treeViewSrc).toMatch(/querySelector[^(]*\('input'\)/);
  });
});
