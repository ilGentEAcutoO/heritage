/**
 * tree-query.ts — returns the full TreeData shape for a given slug.
 *
 * Uses Promise.all for parallel D1 reads (non-atomic, fine for reads).
 * The returned shape is used directly by GET /api/tree/:slug.
 */

import { eq } from 'drizzle-orm';
import type { DB } from '../../db/client';
import {
  trees,
  people,
  relations,
  stories,
  memos,
  photos,
  lineages,
  lineage_members,
} from '../../db/schema';

// ---------------------------------------------------------------------------
// Output types (mirrors frontend TreeData where sensible)
// ---------------------------------------------------------------------------

export interface TreeMeta {
  slug: string;
  name: string;
  nameEn: string | null;
  isPublic: boolean;
  ownerId: string | null;
}

export interface PersonRow {
  id: string;
  name: string;
  nameEn: string | null;
  nick: string | null;
  born: number | null;
  died: number | null;
  gender: 'm' | 'f' | null;
  hometown: string | null;
  isMe: boolean;
  external: boolean;
  avatarKey: string | null;
  // Aggregated from relations
  parents: string[];
  spouses: string[];
}

export interface RelationRow {
  id: number;
  fromId: string;
  toId: string;
  kind: 'parent' | 'spouse';
}

export interface StoryRow {
  id: string;
  year: number | null;
  title: string | null;
  body: string | null;
  createdAt: Date | null;
}

export interface MemoRow {
  id: string;
  byId: string | null;
  duration: number | null;
  title: string | null;
  recordedOn: string | null;
  objectKey: string | null;
}

export interface LineageRow {
  id: string;
  bridgePersonId: string;
  family: string | null;
  familyEn: string | null;
  code: string;
  linkedTreeId: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  members: any[];
}

export interface TreeQueryResult {
  tree: TreeMeta;
  people: PersonRow[];
  relations: RelationRow[];
  /** personId → story list */
  stories: Record<string, StoryRow[]>;
  /** personId → memo list */
  memos: Record<string, MemoRow[]>;
  /** bridgePersonId → lineage */
  lineages: Record<string, LineageRow>;
  /** personId → photo count */
  photoCounts: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Main query function
// ---------------------------------------------------------------------------

/**
 * Fetches a full tree snapshot in parallel D1 reads.
 * Returns `null` if the tree slug doesn't exist.
 */
export async function getTreeData(
  db: DB,
  slug: string,
): Promise<TreeQueryResult | null> {
  // 1. Resolve tree row first (needed for tree_id)
  const treeRow = await db
    .select()
    .from(trees)
    .where(eq(trees.slug, slug))
    .get();

  if (!treeRow) return null;

  const treeId = treeRow.id;

  // 2. Parallel reads
  const [
    peopleRows,
    relationRows,
    storyRows,
    memoRows,
    photoRows,
    lineageRows,
  ] = await Promise.all([
    db.select().from(people).where(eq(people.tree_id, treeId)).all(),
    db.select().from(relations).where(eq(relations.tree_id, treeId)).all(),
    db
      .select({
        id: stories.id,
        person_id: stories.person_id,
        year: stories.year,
        title: stories.title,
        body: stories.body,
        created_at: stories.created_at,
      })
      .from(stories)
      .innerJoin(people, eq(stories.person_id, people.id))
      .where(eq(people.tree_id, treeId))
      .all(),
    db
      .select({
        id: memos.id,
        person_id: memos.person_id,
        by_id: memos.by_id,
        duration: memos.duration,
        title: memos.title,
        recorded_on: memos.recorded_on,
        object_key: memos.object_key,
      })
      .from(memos)
      .innerJoin(people, eq(memos.person_id, people.id))
      .where(eq(people.tree_id, treeId))
      .all(),
    db
      .select({
        person_id: photos.person_id,
      })
      .from(photos)
      .innerJoin(people, eq(photos.person_id, people.id))
      .where(eq(people.tree_id, treeId))
      .all(),
    db
      .select()
      .from(lineages)
      .innerJoin(people, eq(lineages.bridge_person_id, people.id))
      .where(eq(people.tree_id, treeId))
      .all(),
  ]);

  // 3. Fetch lineage members for the found lineages
  const lineageIds = lineageRows.map((r) => r.lineages.id);
  let lineageMemberRows: Array<{ lineage_id: string; person_data: unknown }> = [];
  if (lineageIds.length > 0) {
    // D1 supports parameterized IN queries through individual selects batched
    const memberResults = await Promise.all(
      lineageIds.map((lid) =>
        db
          .select({ lineage_id: lineage_members.lineage_id, person_data: lineage_members.person_data })
          .from(lineage_members)
          .where(eq(lineage_members.lineage_id, lid))
          .all(),
      ),
    );
    lineageMemberRows = memberResults.flat();
  }

  // 4. Build relation lookup for people aggregation
  const parentsByPerson: Record<string, string[]> = {};
  const spousesByPerson: Record<string, string[]> = {};
  for (const r of relationRows) {
    if (r.kind === 'parent') {
      if (!parentsByPerson[r.from_id]) parentsByPerson[r.from_id] = [];
      parentsByPerson[r.from_id].push(r.to_id);
    } else if (r.kind === 'spouse') {
      // Undirected: populate both sides, dedupe with includes-guard to avoid
      // double-listing when the seed stored both (A,B) and (B,A).
      if (!spousesByPerson[r.from_id]) spousesByPerson[r.from_id] = [];
      if (!spousesByPerson[r.to_id]) spousesByPerson[r.to_id] = [];
      if (!spousesByPerson[r.from_id].includes(r.to_id)) spousesByPerson[r.from_id].push(r.to_id);
      if (!spousesByPerson[r.to_id].includes(r.from_id)) spousesByPerson[r.to_id].push(r.from_id);
    }
  }

  // 5. Shape people
  const shapedPeople: PersonRow[] = peopleRows.map((p) => ({
    id: p.id,
    name: p.name,
    nameEn: p.name_en,
    nick: p.nick,
    born: p.born,
    died: p.died,
    gender: p.gender,
    hometown: p.hometown,
    isMe: p.is_me,
    external: p.external,
    avatarKey: p.avatar_key,
    parents: parentsByPerson[p.id] ?? [],
    spouses: spousesByPerson[p.id] ?? [],
  }));

  // 6. Shape relations — deduplicate so each logical edge appears exactly once.
  //
  //   parent edges are directed: (from, to, 'parent') is a unique key.
  //   spouse edges are undirected: (A, B, 'spouse') == (B, A, 'spouse').
  //     Canonical form: lexicographically smaller id goes in `fromId`.
  //
  const canonical = (r: { from_id: string; to_id: string; kind: string }): string =>
    r.kind === 'spouse' && r.from_id > r.to_id
      ? `spouse:${r.to_id}:${r.from_id}`
      : `${r.kind}:${r.from_id}:${r.to_id}`;

  const seen = new Set<string>();
  const shapedRelations: RelationRow[] = [];
  for (const r of relationRows) {
    const key = canonical(r);
    if (seen.has(key)) continue;
    seen.add(key);

    // For spouse edges, normalise to the canonical (smaller id first) orientation.
    const fromId = r.kind === 'spouse' && r.from_id > r.to_id ? r.to_id : r.from_id;
    const toId   = r.kind === 'spouse' && r.from_id > r.to_id ? r.from_id : r.to_id;

    shapedRelations.push({ id: r.id, fromId, toId, kind: r.kind });
  }

  // 7. Group stories by personId
  const storiesMap: Record<string, StoryRow[]> = {};
  for (const s of storyRows) {
    if (!storiesMap[s.person_id]) storiesMap[s.person_id] = [];
    storiesMap[s.person_id].push({
      id: s.id,
      year: s.year,
      title: s.title,
      body: s.body,
      createdAt: s.created_at,
    });
  }

  // 8. Group memos by personId
  const memosMap: Record<string, MemoRow[]> = {};
  for (const m of memoRows) {
    if (!memosMap[m.person_id]) memosMap[m.person_id] = [];
    memosMap[m.person_id].push({
      id: m.id,
      byId: m.by_id,
      duration: m.duration,
      title: m.title,
      recordedOn: m.recorded_on,
      objectKey: m.object_key,
    });
  }

  // 9. Photo counts
  const photoCounts: Record<string, number> = {};
  for (const ph of photoRows) {
    photoCounts[ph.person_id] = (photoCounts[ph.person_id] ?? 0) + 1;
  }

  // 10. Shape lineages
  const membersByLineage: Record<string, unknown[]> = {};
  for (const lm of lineageMemberRows) {
    if (!membersByLineage[lm.lineage_id]) membersByLineage[lm.lineage_id] = [];
    membersByLineage[lm.lineage_id].push(lm.person_data);
  }

  const lineagesMap: Record<string, LineageRow> = {};
  for (const r of lineageRows) {
    const lin = r.lineages;
    lineagesMap[lin.bridge_person_id] = {
      id: lin.id,
      bridgePersonId: lin.bridge_person_id,
      family: lin.family,
      familyEn: lin.family_en,
      code: lin.code,
      linkedTreeId: lin.linked_tree_id,
      members: membersByLineage[lin.id] ?? [],
    };
  }

  return {
    tree: {
      slug: treeRow.slug,
      name: treeRow.name,
      nameEn: treeRow.name_en,
      isPublic: treeRow.is_public,
      ownerId: treeRow.owner_id,
    },
    people: shapedPeople,
    relations: shapedRelations,
    stories: storiesMap,
    memos: memosMap,
    lineages: lineagesMap,
    photoCounts,
  };
}
