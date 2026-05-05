/**
 * ProfileDrawer-pov.test.tsx — TDD source assertions for POV feature.
 *
 * These assertions INTENTIONALLY FAIL until ProfileDrawer.tsx is updated with
 * the new onSetActiveView / isActiveView props (TASK-008).
 *
 * Environment: vitest node (no jsdom). Reads the source file directly.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(
  resolve(__dirname, '../../src/app/components/ProfileDrawer.tsx'),
  'utf-8',
);

describe('ProfileDrawer POV props (source assertions)', () => {
  it('ProfileDrawerProps interface declares onSetActiveView', () => {
    // Must be part of the exported interface
    expect(src).toMatch(/onSetActiveView\s*\??\s*:/);
  });

  it('ProfileDrawerProps interface declares isActiveView', () => {
    expect(src).toMatch(/isActiveView\s*\??\s*:/);
  });

  it('source has a button calling onSetActiveView(person.id)', () => {
    expect(src).toMatch(/onSetActiveView\s*\(\s*person\.id\s*\)/);
  });

  it('source contains the readonly chip text "กำลังดูจากมุมของคนนี้"', () => {
    expect(src).toContain('กำลังดูจากมุมของคนนี้');
  });

  it('conditional render is gated on isActiveView (ternary or negation)', () => {
    // Accept either: isActiveView ? ... OR !isActiveView
    expect(src).toMatch(/isActiveView\s*\?|!isActiveView/);
  });
});
