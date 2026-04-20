/**
 * kinship.ts — Typed port of computeRelation from tree-view.jsx (lines 541–759)
 * and findPath from panels.jsx (lines 285–316).
 *
 * Preserves:
 *  - Paternal/maternal disambiguation via gender of viewer's direct parent on the path
 *  - Nick-suffix format: "ปู่สมชาย" (not "ปู่ ของคุณ")
 *  - Shortened sibling form: พี่/น้อง (no สาว/ชาย)
 *  - Shortened cousin form: "ลูกพี่ลูกน้อง {nick}" (no พี่/น้อง prefix)
 */

import type { Person } from './types';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function nick(p: Person): string {
  return p.nick || p.name || '';
}

function parentsOf(idMap: Record<string, Person>, id: string): string[] {
  return idMap[id]?.parents ?? [];
}

/** Returns the spouse id of `id`, looking both at `spouseOf` field and reverse. */
function spouseOf(people: Person[], idMap: Record<string, Person>, id: string): string | null {
  if (idMap[id]?.spouseOf) return idMap[id].spouseOf!;
  const s = people.find(p => p.spouseOf === id);
  return s ? s.id : null;
}

// ---------------------------------------------------------------------------
// BFS ancestor search
// ---------------------------------------------------------------------------

interface AncestorInfo {
  gen: number;
  /** Gender of viewer's *direct* parent on this chain: 'm' = paternal, 'f' = maternal */
  side: 'm' | 'f';
  path: Array<'m' | 'f'>;
}

/**
 * BFS upward from `ofId`, recording the gender sequence of each ancestor step.
 * Returns info if `targetId` is found as an ancestor of `ofId`.
 * `path[0]` = gender of the first parent on the chain from `ofId`.
 */
function ancestorInfo(
  idMap: Record<string, Person>,
  ofId: string,
  targetId: string,
): AncestorInfo | null {
  type QueueItem = { id: string; path: Array<'m' | 'f'> };
  const queue: QueueItem[] = [{ id: ofId, path: [] }];
  const seen = new Set<string>([ofId]);

  while (queue.length) {
    const { id, path } = queue.shift()!;
    if (id === targetId && path.length > 0) {
      return { gen: path.length, side: path[0], path };
    }
    if (path.length > 8) continue;
    const pars = parentsOf(idMap, id);
    for (const pid of pars) {
      if (seen.has(pid)) continue;
      seen.add(pid);
      const g: 'm' | 'f' = (idMap[pid]?.gender as 'm' | 'f') ?? 'm';
      queue.push({ id: pid, path: [...path, g] });
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// BFS aunt/uncle search
// ---------------------------------------------------------------------------

interface AuntUncleInfo {
  gen: number;
  side: 'm' | 'f';
  ancestorId: string;
}

function findAuntUncle(
  idMap: Record<string, Person>,
  viewerId: string,
  otherId: string,
  oPar: string[],
): AuntUncleInfo | null {
  type QueueItem = { id: string; path: Array<'m' | 'f'> };
  const queue: QueueItem[] = [{ id: viewerId, path: [] }];
  const seen = new Set<string>([viewerId]);

  while (queue.length) {
    const { id, path } = queue.shift()!;
    if (path.length >= 1) {
      const ancPar = parentsOf(idMap, id);
      if (
        ancPar.length &&
        oPar.length &&
        ancPar.some(p => oPar.includes(p)) &&
        id !== otherId
      ) {
        return { gen: path.length, side: path[0], ancestorId: id };
      }
    }
    if (path.length > 6) continue;
    for (const pid of parentsOf(idMap, id)) {
      if (seen.has(pid)) continue;
      seen.add(pid);
      const g: 'm' | 'f' = (idMap[pid]?.gender as 'm' | 'f') ?? 'm';
      queue.push({ id: pid, path: [...path, g] });
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Cousin check
// ---------------------------------------------------------------------------

function findCousin(
  idMap: Record<string, Person>,
  viewerId: string,
  otherId: string,
): boolean {
  // Collect all ancestors of viewer up to depth 5
  const vAll: string[] = [viewerId];
  const vS = new Set<string>([viewerId]);
  let cur: string[] = [viewerId];

  for (let d = 0; d < 5 && cur.length; d++) {
    const nxt: string[] = [];
    for (const c of cur) {
      for (const pp of parentsOf(idMap, c)) {
        if (!vS.has(pp)) { vS.add(pp); nxt.push(pp); vAll.push(pp); }
      }
    }
    cur = nxt;
  }

  // Collect all ancestors of other up to depth 5
  const oS = new Set<string>();
  cur = [otherId];
  for (let d = 0; d < 5 && cur.length; d++) {
    const nxt: string[] = [];
    for (const c of cur) {
      for (const pp of parentsOf(idMap, c)) {
        if (!oS.has(pp)) { oS.add(pp); nxt.push(pp); }
      }
    }
    cur = nxt;
  }

  for (const a of vAll) if (oS.has(a)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Main export: computeRelation
// ---------------------------------------------------------------------------

/**
 * Compute the Thai kinship label of `otherId` from the point of view of `viewerId`.
 *
 * @returns Thai label with the person's nick appended (e.g., "ปู่สมชาย"),
 *          or null if the relationship cannot be determined.
 */
export function computeRelation(
  people: Person[],
  viewerId: string,
  otherId: string,
): string | null {
  if (viewerId === otherId) return 'ฉัน';

  const idMap: Record<string, Person> = Object.fromEntries(people.map(p => [p.id, p]));
  const viewer = idMap[viewerId];
  const other = idMap[otherId];
  if (!viewer || !other) return null;

  const g = other.gender;
  const isF = g === 'f';
  const other_n = nick(other);

  // ── Spouse ──────────────────────────────────────────────────────────────
  if (spouseOf(people, idMap, viewerId) === otherId) {
    return (isF ? 'ภรรยา' : 'สามี') + other_n;
  }

  // ── Direct ancestor ──────────────────────────────────────────────────────
  const vToO = ancestorInfo(idMap, viewerId, otherId);
  if (vToO) {
    const { gen, side } = vToO;
    if (gen === 1) return (isF ? 'แม่' : 'พ่อ') + other_n;
    if (gen === 2) {
      if (side === 'm') return (isF ? 'ย่า' : 'ปู่') + other_n;
      return (isF ? 'ยาย' : 'ตา') + other_n;
    }
    if (gen === 3) {
      if (side === 'm') return (isF ? 'ย่าทวด' : 'ปู่ทวด') + other_n;
      return (isF ? 'ยายทวด' : 'ตาทวด') + other_n;
    }
    return `บรรพบุรุษ${gen} รุ่น ${other_n}`;
  }

  // ── Direct descendant ────────────────────────────────────────────────────
  const oToV = ancestorInfo(idMap, otherId, viewerId);
  if (oToV) {
    const { gen } = oToV;
    if (gen === 1) return (isF ? 'ลูกสาว' : 'ลูกชาย') + other_n;
    if (gen === 2) return 'หลาน' + other_n;
    if (gen === 3) return 'เหลน' + other_n;
    return `ลูกหลาน ${other_n}`;
  }

  // ── Siblings ─────────────────────────────────────────────────────────────
  const vPar = parentsOf(idMap, viewerId);
  const oPar = parentsOf(idMap, otherId);
  if (vPar.length && oPar.length && vPar.some(p => oPar.includes(p))) {
    const olderThan = (other.born ?? 9999) < (viewer.born ?? 9999);
    return (olderThan ? 'พี่' : 'น้อง') + other_n;
  }

  // ── Aunt / uncle ─────────────────────────────────────────────────────────
  const au = findAuntUncle(idMap, viewerId, otherId, oPar);
  if (au) {
    const { gen, side, ancestorId } = au;
    const ancestor = idMap[ancestorId];
    const olderThanAncestor = (other.born ?? 9999) < (ancestor?.born ?? 9999);
    if (gen === 1) {
      // Paternal side (side='m' = father's sibling): older → ลุง/ป้า ; younger → อา
      // Maternal side (side='f' = mother's sibling): older → ลุง/ป้า ; younger → น้า
      if (side === 'm') {
        if (olderThanAncestor) return (isF ? 'ป้า' : 'ลุง') + other_n;
        return 'อา' + other_n;
      } else {
        if (olderThanAncestor) return (isF ? 'ป้า' : 'ลุง') + other_n;
        return 'น้า' + other_n;
      }
    }
    if (gen === 2) {
      // Sibling of grandparent
      if (side === 'm') return (isF ? 'ย่าใหญ่' : 'ปู่ใหญ่') + other_n;
      return (isF ? 'ยายใหญ่' : 'ตาใหญ่') + other_n;
    }
  }

  // ── Spouse-of-relative (in-laws) ─────────────────────────────────────────
  const otherSpouseId = spouseOf(people, idMap, otherId);
  if (otherSpouseId && otherSpouseId !== viewerId) {
    const subRel = computeRelation(people, viewerId, otherSpouseId);
    if (subRel) {
      const spouse = idMap[otherSpouseId];
      // Is the spouse an aunt/uncle of viewer?
      const spPar = parentsOf(idMap, otherSpouseId);
      const auS = findAuntUncle(idMap, viewerId, otherSpouseId, spPar);
      if (auS && auS.gen === 1) {
        const ancestor = idMap[auS.ancestorId];
        const spOlder = (spouse?.born ?? 9999) < (ancestor?.born ?? 9999);
        if (auS.side === 'm') {
          if (spOlder) return (isF ? 'ป้าสะใภ้' : 'ลุงเขย') + other_n;
          return (isF ? 'อาสะใภ้' : 'อาเขย') + other_n;
        } else {
          if (spOlder) return (isF ? 'ป้าสะใภ้' : 'ลุงเขย') + other_n;
          return (isF ? 'น้าสะใภ้' : 'น้าเขย') + other_n;
        }
      }
      // Sibling's spouse
      const spParS = parentsOf(idMap, otherSpouseId);
      if (vPar.length && spParS.length && vPar.some(p => spParS.includes(p))) {
        const spOlder = (spouse?.born ?? 9999) < (viewer.born ?? 9999);
        if (isF) return (spOlder ? 'พี่สะใภ้' : 'น้องสะใภ้') + other_n;
        return (spOlder ? 'พี่เขย' : 'น้องเขย') + other_n;
      }
      // Parent's spouse → step-parent
      if (parentsOf(idMap, viewerId).includes(otherSpouseId)) {
        return (isF ? 'แม่เลี้ยง' : 'พ่อเลี้ยง') + other_n;
      }
      // Generic fallback for in-laws
      return `คู่ของ${subRel}`;
    }
  }

  // ── Cousins ──────────────────────────────────────────────────────────────
  if (findCousin(idMap, viewerId, otherId)) {
    return 'ลูกพี่ลูกน้อง ' + other_n;
  }

  // ── Fallback ─────────────────────────────────────────────────────────────
  return 'ญาติ ' + other_n;
}

// ---------------------------------------------------------------------------
// findPath — BFS to find shortest path between two people (used by PathFinder)
// ---------------------------------------------------------------------------

/**
 * Find the shortest path between two people via parent/child/spouse edges.
 *
 * @returns Array of person ids from `fromId` to `toId`, or null if unreachable.
 */
export function findPath(
  people: Person[],
  fromId: string,
  toId: string,
): string[] | null {
  if (!fromId || !toId) return null;

  // Build adjacency: parent↔child and spouse↔spouse (undirected)
  const adj: Record<string, Set<string>> = {};
  for (const p of people) {
    adj[p.id] = adj[p.id] ?? new Set<string>();
    for (const pid of p.parents ?? []) {
      adj[p.id].add(pid);
      adj[pid] = adj[pid] ?? new Set<string>();
      adj[pid].add(p.id);
    }
    if (p.spouseOf) {
      adj[p.id].add(p.spouseOf);
      adj[p.spouseOf] = adj[p.spouseOf] ?? new Set<string>();
      adj[p.spouseOf].add(p.id);
    }
  }

  // BFS
  const q: string[][] = [[fromId]];
  const seen = new Set<string>([fromId]);
  while (q.length) {
    const path = q.shift()!;
    const last = path[path.length - 1];
    if (last === toId) return path;
    for (const n of adj[last] ?? []) {
      if (!seen.has(n)) {
        seen.add(n);
        q.push([...path, n]);
      }
    }
  }
  return null;
}
