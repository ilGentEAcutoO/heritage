/**
 * src/app/lib/layout.ts
 * Ported from /tmp/design_bundle/family-tree/project/tree-view.jsx
 * Functions: layoutBaseTree, layoutTree, branchPath
 *
 * Coordinate system: x grows right, y grows DOWN.
 * Gen 0 (great-grandparents) is at the TOP (small y), Gen 3 at BOTTOM (large y).
 * Lineage ancestors placed ABOVE their bridge → even smaller y (may go negative).
 */

// ---------------------------------------------------------------------------
// Type imports
// ---------------------------------------------------------------------------

import type { Person } from './types';

export interface LayoutPerson {
  id: string;
  nick: string;
  born: number;
  died: number | null;
  gender: 'm' | 'f';
  hometown?: string;
  parents?: string[];
  spouseOf?: string;
  external?: boolean;
  isMe?: boolean;
  isBridge?: boolean;
}

/**
 * Convert a domain Person (from API/DB) to a LayoutPerson suitable for
 * layout algorithms. Returns null if the person lacks required layout data
 * (unknown birth year) — callers should filter these out.
 */
export function toLayoutPerson(p: Person): LayoutPerson | null {
  if (p.born == null) return null;
  const nick = p.nick ?? p.name ?? p.id;
  return {
    id: p.id,
    nick,
    born: p.born,
    died: p.died,
    gender: p.gender,
    hometown: p.hometown,
    parents: p.parents,
    spouseOf: p.spouseOf,
    external: p.external,
    isMe: p.isMe,
    isBridge: p.isBridge,
  };
}

export interface LineagePreviewPerson {
  id: string;
  nick: string;
  born: number;
  died: number | null;
  gender: 'm' | 'f';
  parents?: string[];
  spouseOf?: string;
  isBridge?: boolean;
}

export interface Lineage {
  family: string;
  familyEn: string;
  code: string;
  members: number;
  linked: boolean;
  preview: LineagePreviewPerson[];
}

// ---------------------------------------------------------------------------
// Layout constants (must match prototype exactly)
// ---------------------------------------------------------------------------

const W = 1200;
const H = 820;
const genY = [120, 300, 500, 720] as const;

// Gen 1: two couples. Pranom is external (from another lineage) — pull her further out.
// Indices: [somchai(p3), wipa(p4), prayuth(p5), pranom(p6)] → 120px gaps within couples, 480px between couples
const g1Xs = [W / 2 - 360, W / 2 - 240, W / 2 + 240, W / 2 + 360] as const;

// Gen 2: specific per-id x positions
const g2Xs: Record<string, number> = {
  p7:  W / 2 - 440,
  p8:  W / 2 - 340,
  p9:  W / 2 - 120,
  p10: W / 2 - 20,
  p11: W / 2 + 340,
};

// Gen 3: specific per-id x positions
const g3Xs: Record<string, number> = {
  p12: W / 2 - 470,
  p13: W / 2 - 360,
  p14: W / 2 - 140,
  p15: W / 2 - 30,
  p16: W / 2 + 340,
};

// ---------------------------------------------------------------------------
// layoutBaseTree
// ---------------------------------------------------------------------------

export interface BaseTreeResult {
  positions: Record<string, { x: number; y: number }>;
  W: number;
  H: number;
  byGen: LayoutPerson[][];
}

/**
 * Lay out the base 16-person Wongsuriya tree.
 * Each person gets an (x, y) position. Couples are adjacent.
 * Generational y-coords: genY = [120, 300, 500, 720]
 */
export function layoutBaseTree(people: LayoutPerson[]): BaseTreeResult {
  const byGen: LayoutPerson[][] = [[], [], [], []];
  const idToPerson = Object.fromEntries(people.map(p => [p.id, p]));

  // Compute generation depth = longest parent chain
  const depthCache: Record<string, number> = {};
  function depth(p: LayoutPerson): number {
    if (p.id in depthCache) return depthCache[p.id];
    if (!p.parents || p.parents.length === 0) {
      // Spouse inherits from partner
      if (p.spouseOf && idToPerson[p.spouseOf]) {
        depthCache[p.id] = depth(idToPerson[p.spouseOf]);
        return depthCache[p.id];
      }
      depthCache[p.id] = 0;
      return 0;
    }
    const parentDepths = p.parents.map(pid => idToPerson[pid] ? depth(idToPerson[pid]) : 0);
    depthCache[p.id] = 1 + Math.max(...parentDepths);
    return depthCache[p.id];
  }

  const depths: Record<string, number> = {};
  for (const p of people) depths[p.id] = depth(p);

  // Group people by generation
  for (const p of people) {
    const d = depths[p.id];
    if (!byGen[d]) byGen[d] = [];
    byGen[d].push(p);
  }

  const positions: Record<string, { x: number; y: number }> = {};

  // ---------------------------------------------------------------------------
  // Gen 0: place couple centered at W/2
  // ---------------------------------------------------------------------------
  const g0 = byGen[0] ?? [];
  if (g0.length === 2) {
    positions[g0[0].id] = { x: W / 2 - 55, y: genY[0] };
    positions[g0[1].id] = { x: W / 2 + 55, y: genY[0] };
  } else if (g0.length === 1) {
    positions[g0[0].id] = { x: W / 2, y: genY[0] };
  }

  // ---------------------------------------------------------------------------
  // Gen 1: two couples, order them with spouses adjacent
  // ---------------------------------------------------------------------------
  const g1 = byGen[1] ?? [];
  const g1Ordered: LayoutPerson[] = [];
  const g1Seen = new Set<string>();
  for (const p of g1) {
    if (g1Seen.has(p.id)) continue;
    g1Ordered.push(p);
    g1Seen.add(p.id);
    const spouse = g1.find(q => q.spouseOf === p.id || p.spouseOf === q.id);
    if (spouse && !g1Seen.has(spouse.id)) {
      g1Ordered.push(spouse);
      g1Seen.add(spouse.id);
    }
  }
  g1Ordered.forEach((p, i) => {
    if (i < g1Xs.length) {
      positions[p.id] = { x: g1Xs[i], y: genY[1] };
    }
  });

  // ---------------------------------------------------------------------------
  // Gen 2: specific per-id positions
  // ---------------------------------------------------------------------------
  const g2 = byGen[2] ?? [];
  const g2Ordered: LayoutPerson[] = [];
  const g2Seen = new Set<string>();
  for (const p of g2) {
    if (g2Seen.has(p.id)) continue;
    g2Ordered.push(p);
    g2Seen.add(p.id);
    const spouse = g2.find(q => q.spouseOf === p.id || p.spouseOf === q.id);
    if (spouse && !g2Seen.has(spouse.id)) {
      g2Ordered.push(spouse);
      g2Seen.add(spouse.id);
    }
  }
  for (const p of g2Ordered) {
    if (g2Xs[p.id] !== undefined) {
      positions[p.id] = { x: g2Xs[p.id], y: genY[2] };
    }
  }

  // ---------------------------------------------------------------------------
  // Gen 3: specific per-id positions
  // ---------------------------------------------------------------------------
  const g3 = byGen[3] ?? [];
  for (const p of g3) {
    if (g3Xs[p.id] !== undefined) {
      positions[p.id] = { x: g3Xs[p.id], y: genY[3] };
    }
  }

  return { positions, W, H, byGen };
}

// ---------------------------------------------------------------------------
// layoutTree
// ---------------------------------------------------------------------------

export interface LineageNode extends LineagePreviewPerson {
  bridgeId: string;
  renderId: string;
  depth: number;
}

export interface LineageEdge {
  from: { x: number; y: number };
  to: { x: number; y: number };
  key: string;
  lineage: boolean;
}

export interface LineageSpouseLink {
  a: { x: number; y: number };
  b: { x: number; y: number };
  key: string;
}

export interface TreeLayoutResult {
  positions: Record<string, { x: number; y: number }>;
  W: number;
  H: number;
  lineageNodes: LineageNode[];
  lineageEdges: LineageEdge[];
  lineageSpouse: LineageSpouseLink[];
  minY?: number;
}

/**
 * Full layout: base tree + optional expanded external lineages.
 * Expanded lineage ancestors are placed ABOVE the bridge person.
 * Each depth level is 120px above the previous (y = bridge.y - depth * 120).
 * Spouses within a lineage level are spaced 85px apart.
 */
export function layoutTree(
  people: LayoutPerson[],
  lineages: Record<string, Lineage> | undefined,
  expanded: Set<string> | undefined,
): TreeLayoutResult {
  const base = layoutBaseTree(people);
  const positions: Record<string, { x: number; y: number }> = { ...base.positions };
  const lineageNodes: LineageNode[] = [];
  const lineageEdges: LineageEdge[] = [];
  const lineageSpouse: LineageSpouseLink[] = [];

  if (!lineages || !expanded || expanded.size === 0) {
    return { positions, W: base.W, H: base.H, lineageNodes, lineageEdges, lineageSpouse };
  }

  for (const bridgeId of expanded) {
    const lineage = lineages[bridgeId];
    if (!lineage) continue;
    const bridgePos = positions[bridgeId];
    if (!bridgePos) continue;

    // Build lookup map for lineage preview people
    const lmap = Object.fromEntries(lineage.preview.map(p => [p.id, p]));

    // BFS upward to compute depth of each preview person relative to bridge
    // depth 0 = bridge, depth 1 = bridge's parents, depth 2 = grandparents, etc.
    const depthFromBridge: Record<string, number> = {};
    depthFromBridge[bridgeId] = 0;
    const q: string[] = [bridgeId];
    while (q.length) {
      const cur = q.shift()!;
      const node = lmap[cur];
      if (!node) continue;
      const parents = node.parents ?? [];
      for (const pid of parents) {
        if (!(pid in depthFromBridge)) {
          depthFromBridge[pid] = depthFromBridge[cur] + 1;
          q.push(pid);
        }
      }
    }

    // Spouses inherit their partner's depth
    for (const p of lineage.preview) {
      if (p.spouseOf && depthFromBridge[p.spouseOf] != null && depthFromBridge[p.id] == null) {
        depthFromBridge[p.id] = depthFromBridge[p.spouseOf];
      }
    }

    // Group preview people by depth (excluding bridge itself at depth 0)
    const byDepth: Record<number, LineagePreviewPerson[]> = {};
    for (const p of lineage.preview) {
      if (p.id === bridgeId) continue;
      const d = depthFromBridge[p.id];
      if (d == null || d < 1) continue;
      if (!byDepth[d]) byDepth[d] = [];
      byDepth[d].push(p);
    }

    // Order couples adjacent within each depth level
    for (const dStr of Object.keys(byDepth)) {
      const d = +dStr;
      const arr = byDepth[d];
      const ordered: LineagePreviewPerson[] = [];
      const seen = new Set<string>();
      for (const p of arr) {
        if (seen.has(p.id)) continue;
        ordered.push(p);
        seen.add(p.id);
        const s = arr.find(q => q.spouseOf === p.id || p.spouseOf === q.id);
        if (s && !seen.has(s.id)) {
          ordered.push(s);
          seen.add(s.id);
        }
      }
      byDepth[d] = ordered;
    }

    // Place each depth level centered above the bridge
    for (const dStr of Object.keys(byDepth)) {
      const d = +dStr;
      const arr = byDepth[d];
      const y = bridgePos.y - d * 120;
      const totalW = Math.max(arr.length - 1, 0) * 85;
      arr.forEach((p, i) => {
        const x = bridgePos.x - totalW / 2 + i * 85;
        const renderId = `L:${bridgeId}:${p.id}`;
        positions[renderId] = { x, y };
        lineageNodes.push({ ...p, bridgeId, renderId, depth: d });
      });
    }

    // Edge: bridge → its parents in lineage
    const bridgeNode = lmap[bridgeId];
    if (bridgeNode && bridgeNode.parents) {
      const parPosns = bridgeNode.parents
        .map(pid => positions[`L:${bridgeId}:${pid}`])
        .filter((p): p is { x: number; y: number } => p != null);
      if (parPosns.length) {
        const midX = parPosns.reduce((s, p) => s + p.x, 0) / parPosns.length;
        const midY = parPosns[0].y + 40;
        lineageEdges.push({
          from: { x: midX, y: midY },
          to: bridgePos,
          key: `le-bridge-${bridgeId}`,
          lineage: true,
        });
      }
    }

    // Edges within lineage: child → parents
    for (const p of lineage.preview) {
      if (p.id === bridgeId) continue;
      if (!p.parents) continue;
      const myPos = positions[`L:${bridgeId}:${p.id}`];
      if (!myPos) continue;
      const parPosns = p.parents
        .map(pid => positions[`L:${bridgeId}:${pid}`])
        .filter((pos): pos is { x: number; y: number } => pos != null);
      if (!parPosns.length) continue;
      const midX = parPosns.reduce((s, pos) => s + pos.x, 0) / parPosns.length;
      const midY = parPosns[0].y + 40;
      lineageEdges.push({
        from: { x: midX, y: midY },
        to: myPos,
        key: `le-${bridgeId}-${p.id}`,
        lineage: true,
      });
    }

    // Spouse links within lineage
    for (const p of lineage.preview) {
      if (p.id === bridgeId) continue;
      if (!p.spouseOf) continue;
      const a = positions[`L:${bridgeId}:${p.id}`];
      const b = positions[`L:${bridgeId}:${p.spouseOf}`];
      if (a && b) {
        lineageSpouse.push({ a, b, key: `ls-${bridgeId}-${p.id}` });
      }
    }
  }

  // Compute minY: smallest y among all lineage nodes
  const minY = Math.min(
    base.H,
    ...lineageNodes.map(n => positions[n.renderId]?.y ?? 99999),
  );

  return { positions, W: base.W, H: base.H, lineageNodes, lineageEdges, lineageSpouse, minY };
}

// ---------------------------------------------------------------------------
// branchPath
// ---------------------------------------------------------------------------

/**
 * Compute a cubic bezier SVG path for a branch from (x1,y1) to (x2,y2).
 * Control points use midY to create a smooth S-curve.
 */
export function branchPath(x1: number, y1: number, x2: number, y2: number): string {
  const midY = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
}
