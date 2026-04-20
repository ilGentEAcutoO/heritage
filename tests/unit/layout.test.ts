/**
 * tests/unit/layout.test.ts
 * TDD tests for layoutBaseTree, layoutTree, and branchPath
 * Fixture is derived from /tmp/design_bundle/family-tree/project/data.js
 */

import { describe, test, expect } from 'vitest';
import { layoutBaseTree, layoutTree, branchPath, toLayoutPerson } from '../../src/app/lib/layout';

// ---------------------------------------------------------------------------
// Minimal fixture — 16-person Wongsuriya family + p6 (Pranom) lineage
// ---------------------------------------------------------------------------

const people = [
  // Gen 0 — great-grandparents
  { id: 'p1', nick: 'ก้าน',    born: 1918, died: 1994, gender: 'm' as const, hometown: 'อยุธยา' },
  { id: 'p2', nick: 'มาลี',   born: 1922, died: 2001, gender: 'f' as const, hometown: 'อยุธยา', spouseOf: 'p1' },

  // Gen 1 — grandparents
  { id: 'p3', nick: 'สมชาย',  born: 1945, died: 2018, gender: 'm' as const, hometown: 'กรุงเทพ', parents: ['p1', 'p2'] },
  { id: 'p4', nick: 'วิภา',   born: 1948, died: null,  gender: 'f' as const, hometown: 'เชียงใหม่', spouseOf: 'p3', external: true },
  { id: 'p5', nick: 'ประยุทธ', born: 1947, died: null,  gender: 'm' as const, hometown: 'กรุงเทพ', parents: ['p1', 'p2'] },
  { id: 'p6', nick: 'ประนอม', born: 1950, died: null,  gender: 'f' as const, hometown: 'นครปฐม', spouseOf: 'p5', external: true },

  // Gen 2
  { id: 'p7',  nick: 'อรุณ',   born: 1972, died: null, gender: 'm' as const, hometown: 'กรุงเทพ', parents: ['p3', 'p4'] },
  { id: 'p8',  nick: 'ดาริน',  born: 1975, died: null, gender: 'f' as const, hometown: 'ขอนแก่น', spouseOf: 'p7', external: true },
  { id: 'p9',  nick: 'อรวรรณ', born: 1974, died: null, gender: 'f' as const, hometown: 'กรุงเทพ', parents: ['p3', 'p4'] },
  { id: 'p10', nick: 'ธนา',    born: 1971, died: null, gender: 'm' as const, hometown: 'ระยอง', spouseOf: 'p9', external: true },
  { id: 'p11', nick: 'ไพโรจน์', born: 1976, died: null, gender: 'm' as const, hometown: 'ภูเก็ต', parents: ['p5', 'p6'] },

  // Gen 3
  { id: 'p12', nick: 'นภา',   born: 2001, died: null, gender: 'f' as const, hometown: 'กรุงเทพ', parents: ['p7', 'p8'], isMe: true },
  { id: 'p13', nick: 'ภูมิ',  born: 2005, died: null, gender: 'm' as const, hometown: 'กรุงเทพ', parents: ['p7', 'p8'] },
  { id: 'p14', nick: 'กานต์', born: 1998, died: null, gender: 'm' as const, hometown: 'กรุงเทพ', parents: ['p9', 'p10'] },
  { id: 'p15', nick: 'แพรว',  born: 2000, died: null, gender: 'f' as const, hometown: 'ระยอง', parents: ['p9', 'p10'] },
  { id: 'p16', nick: 'ติณณ์', born: 2008, died: null, gender: 'm' as const, hometown: 'ภูเก็ต', parents: ['p11'] },
];

// p6 (Pranom / ประนอม) lineage — Jaidee family, 2 ancestry levels above
const lineages: Record<string, {
  family: string;
  familyEn: string;
  code: string;
  members: number;
  linked: boolean;
  preview: Array<{
    id: string;
    nick: string;
    born: number;
    died: number | null;
    gender: 'm' | 'f';
    parents?: string[];
    spouseOf?: string;
    isBridge?: boolean;
  }>;
}> = {
  p6: {
    family: 'บ้านใจดี',
    familyEn: 'Jaidee Family',
    code: 'JAIDEE-8K21-TR3E',
    members: 14,
    linked: false,
    preview: [
      { id: 'j1', nick: 'บุญส่ง', born: 1898, died: 1972, gender: 'm' },
      { id: 'j2', nick: 'สุดใจ',  born: 1902, died: 1978, gender: 'f', spouseOf: 'j1' },
      { id: 'j3', nick: 'จรูญ',   born: 1924, died: 1998, gender: 'm', parents: ['j1', 'j2'] },
      { id: 'j4', nick: 'เฉลา',   born: 1928, died: 2010, gender: 'f', spouseOf: 'j3' },
      { id: 'p6', nick: 'ประนอม', born: 1950, died: null, gender: 'f', parents: ['j3', 'j4'], isBridge: true },
    ],
  },
};

// ---------------------------------------------------------------------------
// describe('layoutBaseTree')
// ---------------------------------------------------------------------------

describe('layoutBaseTree', () => {
  test('positions all 16 Wongsuriya people', () => {
    const { positions } = layoutBaseTree(people);
    // All 16 people should have positions
    for (const p of people) {
      expect(positions[p.id], `Missing position for ${p.id}`).toBeDefined();
      expect(typeof positions[p.id].x).toBe('number');
      expect(typeof positions[p.id].y).toBe('number');
    }
    expect(Object.keys(positions)).toHaveLength(16);
  });

  test('gen 0 (kan+malee) centered at W/2 = 600', () => {
    const { positions, W } = layoutBaseTree(people);
    // p1 and p2 are the couple; they should be symmetric around W/2 = 600
    const p1x = positions['p1'].x;
    const p2x = positions['p2'].x;
    const center = (p1x + p2x) / 2;
    expect(center).toBeCloseTo(W / 2, 5); // W=1200, center=600
    // Verify W is 1200
    expect(W).toBe(1200);
  });

  test('couples p3/p4 (somchai/wipa) are adjacent with |p3.x - p4.x| = 120', () => {
    const { positions } = layoutBaseTree(people);
    const p3x = positions['p3'].x;
    const p4x = positions['p4'].x;
    // The g1Xs array places them 120 apart (W/2-360 and W/2-240)
    expect(Math.abs(p3x - p4x)).toBeCloseTo(120, 5);
  });

  test('each generation y is consistent: genY = [120, 300, 500, 720]', () => {
    const { positions } = layoutBaseTree(people);
    const genY = [120, 300, 500, 720];

    // Gen 0: p1, p2
    expect(positions['p1'].y).toBe(genY[0]);
    expect(positions['p2'].y).toBe(genY[0]);

    // Gen 1: p3, p4, p5, p6
    expect(positions['p3'].y).toBe(genY[1]);
    expect(positions['p4'].y).toBe(genY[1]);
    expect(positions['p5'].y).toBe(genY[1]);
    expect(positions['p6'].y).toBe(genY[1]);

    // Gen 2: p7, p8, p9, p10, p11
    expect(positions['p7'].y).toBe(genY[2]);
    expect(positions['p8'].y).toBe(genY[2]);
    expect(positions['p9'].y).toBe(genY[2]);
    expect(positions['p11'].y).toBe(genY[2]);

    // Gen 3: p12, p13, p14, p15, p16
    expect(positions['p12'].y).toBe(genY[3]);
    expect(positions['p13'].y).toBe(genY[3]);
    expect(positions['p14'].y).toBe(genY[3]);
    expect(positions['p15'].y).toBe(genY[3]);
    expect(positions['p16'].y).toBe(genY[3]);
  });

  test('gen 1 pranom (p6) is pulled out further (x > p5.x)', () => {
    const { positions } = layoutBaseTree(people);
    // g1Xs: [W/2 - 360, W/2 - 240, W/2 + 240, W/2 + 360]
    // g1Ordered should be [somchai(p3), wipa(p4), prayuth(p5), pranom(p6)]
    // So p5.x = W/2 + 240 = 840, p6.x = W/2 + 360 = 960
    // p6 is further right than p5
    const p5x = positions['p5'].x;
    const p6x = positions['p6'].x;
    expect(p6x).toBeGreaterThan(p5x);
    // Verify exact values
    expect(p5x).toBe(600 + 240); // 840
    expect(p6x).toBe(600 + 360); // 960
  });
});

// ---------------------------------------------------------------------------
// describe('layoutTree with no expansion')
// ---------------------------------------------------------------------------

describe('layoutTree with no expansion', () => {
  test('returns positions for all 16 + empty lineageNodes/lineageEdges', () => {
    const result = layoutTree(people, undefined, undefined);
    // All 16 positions present
    for (const p of people) {
      expect(result.positions[p.id], `Missing position for ${p.id}`).toBeDefined();
    }
    expect(result.lineageNodes).toHaveLength(0);
    expect(result.lineageEdges).toHaveLength(0);
    expect(result.lineageSpouse).toHaveLength(0);
  });

  test('returns W=1200 and H=820', () => {
    const result = layoutTree(people, undefined, undefined);
    expect(result.W).toBe(1200);
    expect(result.H).toBe(820);
  });
});

// ---------------------------------------------------------------------------
// describe('layoutTree with lineage expansion for p6 (pranom)')
// ---------------------------------------------------------------------------

describe('layoutTree with lineage expansion for p6 (pranom)', () => {
  // p6's bridge position in the main tree
  // From g1Xs: p6 is at index 3 → x = W/2 + 360 = 960, y = genY[1] = 300

  test('lineage preview people placed ABOVE bridge (y < bridge.y)', () => {
    const expanded = new Set(['p6']);
    const { positions, lineageNodes } = layoutTree(people, lineages, expanded);
    const bridgeY = positions['p6'].y; // 300

    // All lineage nodes should be above the bridge (y < bridgeY)
    for (const node of lineageNodes) {
      const nodePos = positions[node.renderId];
      expect(nodePos, `Missing position for lineage node ${node.renderId}`).toBeDefined();
      expect(nodePos.y, `${node.renderId} should be above bridge`).toBeLessThan(bridgeY);
    }
  });

  test('renderIds use prefix L:p6:', () => {
    const expanded = new Set(['p6']);
    const { lineageNodes } = layoutTree(people, lineages, expanded);

    // Should have nodes (j1, j2, j3, j4 — excluding the bridge p6 itself)
    expect(lineageNodes.length).toBeGreaterThan(0);
    for (const node of lineageNodes) {
      expect(node.renderId).toMatch(/^L:p6:/);
    }
  });

  test('lineageEdges include a bridge edge from parents to p6', () => {
    const expanded = new Set(['p6']);
    const { lineageEdges } = layoutTree(people, lineages, expanded);

    // Should have at least a bridge edge
    expect(lineageEdges.length).toBeGreaterThan(0);
    // The bridge edge key is le-bridge-p6
    const bridgeEdge = lineageEdges.find(e => e.key === 'le-bridge-p6');
    expect(bridgeEdge).toBeDefined();
    // Bridge edge "to" should be bridge position (p6)
  });

  test('spouses in lineage get placed side by side (|x1-x2| = 85)', () => {
    const expanded = new Set(['p6']);
    const { positions, lineageNodes } = layoutTree(people, lineages, expanded);

    // j1 and j2 are spouses (j2.spouseOf = j1) — both at depth 2
    const j1Node = lineageNodes.find(n => n.id === 'j1');
    const j2Node = lineageNodes.find(n => n.id === 'j2');

    expect(j1Node).toBeDefined();
    expect(j2Node).toBeDefined();

    const j1Pos = positions[j1Node!.renderId];
    const j2Pos = positions[j2Node!.renderId];

    expect(j1Pos).toBeDefined();
    expect(j2Pos).toBeDefined();

    // Spouses placed with 85px spacing
    expect(Math.abs(j1Pos.x - j2Pos.x)).toBeCloseTo(85, 5);
  });

  test('depth 1 nodes are at y = bridge.y - 120', () => {
    const expanded = new Set(['p6']);
    const { positions, lineageNodes } = layoutTree(people, lineages, expanded);
    const bridgeY = positions['p6'].y; // 300

    // j3, j4 are at depth 1 (direct parents of p6)
    const depth1Nodes = lineageNodes.filter(n => n.depth === 1);
    expect(depth1Nodes.length).toBeGreaterThan(0);

    for (const node of depth1Nodes) {
      const pos = positions[node.renderId];
      expect(pos.y).toBeCloseTo(bridgeY - 120, 5); // 300 - 120 = 180
    }
  });

  test('depth 2 nodes are at y = bridge.y - 240', () => {
    const expanded = new Set(['p6']);
    const { positions, lineageNodes } = layoutTree(people, lineages, expanded);
    const bridgeY = positions['p6'].y; // 300

    // j1, j2 are at depth 2 (grandparents of p6)
    const depth2Nodes = lineageNodes.filter(n => n.depth === 2);
    expect(depth2Nodes.length).toBeGreaterThan(0);

    for (const node of depth2Nodes) {
      const pos = positions[node.renderId];
      expect(pos.y).toBeCloseTo(bridgeY - 240, 5); // 300 - 240 = 60
    }
  });
});

// ---------------------------------------------------------------------------
// describe('branchPath')
// ---------------------------------------------------------------------------

describe('branchPath', () => {
  test('returns a valid SVG cubic bezier path string', () => {
    const path = branchPath(100, 200, 300, 400);
    // Should be a cubic bezier: M x1 y1 C x1 midY, x2 midY, x2 y2
    expect(path).toMatch(/^M \d+ \d+ C /);
    expect(path).toContain('M 100 200');
    expect(path).toContain('300 400');
  });

  test('midY is the average of y1 and y2', () => {
    const path = branchPath(0, 100, 0, 200);
    // midY = 150; path: M 0 100 C 0 150, 0 150, 0 200
    expect(path).toBe('M 0 100 C 0 150, 0 150, 0 200');
  });

  test('works for same x (vertical branch)', () => {
    const path = branchPath(500, 300, 500, 500);
    const midY = (300 + 500) / 2; // 400
    expect(path).toBe(`M 500 300 C 500 ${midY}, 500 ${midY}, 500 500`);
  });
});

// ---------------------------------------------------------------------------
// describe('toLayoutPerson')
// ---------------------------------------------------------------------------

describe('toLayoutPerson', () => {
  test('returns null when born is null', () => {
    const person = {
      id: 'p99',
      nick: 'ทดสอบ',
      born: null,
      died: null,
      gender: 'f' as const,
    };
    expect(toLayoutPerson(person)).toBeNull();
  });

  test('correctly shapes a full Person into LayoutPerson', () => {
    const person = {
      id: 'p1',
      nick: 'ก้าน',
      name: 'กาน วงศ์สุริยา',
      born: 1918,
      died: 1994,
      gender: 'm' as const,
      hometown: 'อยุธยา',
      parents: ['p0a', 'p0b'],
      spouseOf: undefined,
      external: false,
      isMe: false,
      isBridge: false,
    };
    const result = toLayoutPerson(person);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('p1');
    expect(result!.nick).toBe('ก้าน');
    expect(result!.born).toBe(1918);
    expect(result!.died).toBe(1994);
    expect(result!.gender).toBe('m');
    expect(result!.hometown).toBe('อยุธยา');
    expect(result!.parents).toEqual(['p0a', 'p0b']);
  });

  test('falls back to name when nick is absent', () => {
    const person = {
      id: 'p55',
      name: 'สมหวัง',
      born: 1960,
      died: null,
      gender: 'm' as const,
    };
    const result = toLayoutPerson(person);
    expect(result).not.toBeNull();
    expect(result!.nick).toBe('สมหวัง');
  });

  test('falls back to id when both nick and name are absent', () => {
    const person = {
      id: 'p66',
      born: 1970,
      died: null,
      gender: 'f' as const,
    };
    const result = toLayoutPerson(person);
    expect(result).not.toBeNull();
    expect(result!.nick).toBe('p66');
  });
});
