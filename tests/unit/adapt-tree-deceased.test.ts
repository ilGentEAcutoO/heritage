/**
 * adapt-tree-deceased.test.ts — unit tests for adaptTree's deceased field mapping.
 *
 * Environment: vitest 'node' (no jsdom). Pure function assertions only.
 *
 * Contract (Workstream 08):
 *   people.deceased (boolean) is the SOURCE OF TRUTH for alive/deceased.
 *   `died` (number|null) is the optional death-year detail.
 *   adaptTree MUST carry deceased through to Person verbatim.
 */

import { describe, it, expect } from 'vitest';
import { adaptTree } from '@app/lib/api';
import type { ApiTreeResponse } from '@app/lib/api';

// ---------------------------------------------------------------------------
// Minimal ApiTreeResponse builder
// ---------------------------------------------------------------------------

function makeRawTree(
  people: ApiTreeResponse['people'],
): ApiTreeResponse {
  return {
    tree: {
      slug: 'test-tree',
      name: 'Test Tree',
      nameEn: null,
      visibility: 'public',
      ownerId: null,
      theme: null,
    },
    people,
    relations: [],
    stories: {},
    memos: {},
    lineages: {},
    photoCounts: {},
    photos: {},
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const deceasedPerson: ApiTreeResponse['people'][number] = {
  id: 'p1',
  name: 'กาน วงศ์สุริยา',
  nameEn: null,
  nick: 'ก้าน',
  born: 1918,
  died: 1994,
  deceased: true,
  gender: 'm',
  hometown: 'อยุธยา',
  isMe: false,
  external: false,
  avatarKey: null,
  parents: [],
  spouses: [],
};

const alivePerson: ApiTreeResponse['people'][number] = {
  id: 'p2',
  name: 'วิภา',
  nameEn: null,
  nick: 'วิภา',
  born: 1948,
  died: null,
  deceased: false,
  gender: 'f',
  hometown: 'เชียงใหม่',
  isMe: false,
  external: false,
  avatarKey: null,
  parents: [],
  spouses: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('adaptTree — deceased field mapping', () => {
  it('carries deceased=true + died=1994 through to Person for a deceased person', () => {
    const raw = makeRawTree([deceasedPerson]);
    const treeData = adaptTree(raw);

    expect(treeData.people).toHaveLength(1);
    const person = treeData.people[0];

    expect(person.id).toBe('p1');
    expect(person.deceased).toBe(true);
    expect(person.died).toBe(1994);
  });

  it('carries deceased=false + died=null through to Person for a living person', () => {
    const raw = makeRawTree([alivePerson]);
    const treeData = adaptTree(raw);

    expect(treeData.people).toHaveLength(1);
    const person = treeData.people[0];

    expect(person.id).toBe('p2');
    expect(person.deceased).toBe(false);
    expect(person.died).toBeNull();
  });

  it('handles both persons in the same tree independently', () => {
    const raw = makeRawTree([deceasedPerson, alivePerson]);
    const treeData = adaptTree(raw);

    expect(treeData.people).toHaveLength(2);

    const p1 = treeData.people.find((p) => p.id === 'p1');
    const p2 = treeData.people.find((p) => p.id === 'p2');

    expect(p1).toBeDefined();
    expect(p1!.deceased).toBe(true);
    expect(p1!.died).toBe(1994);

    expect(p2).toBeDefined();
    expect(p2!.deceased).toBe(false);
    expect(p2!.died).toBeNull();
  });

  it('does NOT derive deceased from (died != null) — uses the explicit field', () => {
    // Contract: deceased is the SOURCE OF TRUTH, not derived from died.
    // A person with deceased=true but died=null (year unknown) must remain deceased.
    const deceasedUnknownYear: ApiTreeResponse['people'][number] = {
      ...deceasedPerson,
      id: 'p3',
      died: null,
      deceased: true,
    };

    const raw = makeRawTree([deceasedUnknownYear]);
    const treeData = adaptTree(raw);

    const person = treeData.people[0];
    expect(person.deceased).toBe(true);
    expect(person.died).toBeNull();
  });

  it('preserves deceased=false even when died is accidentally set (data-integrity guard)', () => {
    // Edge-case: API sends deceased=false with a non-null died (shouldn't happen after
    // endpoint enforcement, but adaptTree must pass it through verbatim — not override it).
    const inconsistentPerson: ApiTreeResponse['people'][number] = {
      ...alivePerson,
      id: 'p4',
      died: 2000,
      deceased: false,
    };

    const raw = makeRawTree([inconsistentPerson]);
    const treeData = adaptTree(raw);

    const person = treeData.people[0];
    // adaptTree is a dumb adapter — it passes the field as-is.
    expect(person.deceased).toBe(false);
    expect(person.died).toBe(2000);
  });
});
