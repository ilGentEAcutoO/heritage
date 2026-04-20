/**
 * api.ts — typed fetch wrapper with credentials: 'include'
 *
 * Read-only API client. Mutations have been removed; this module only
 * exposes getTree and the adaptTree data adapter.
 */

import type { TreeData, Person } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApiError {
  error: string;
  status: number;
}

/** Shape returned by GET /api/tree/:slug — mirrors TreeQueryResult from tree-query.ts */
export interface ApiTreeResponse {
  tree: {
    slug: string;
    name: string;
    nameEn: string | null;
    isPublic: boolean;
    ownerId: string | null;
  };
  people: Array<{
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
    parents: string[];
    spouses: string[];
  }>;
  relations: Array<{
    id: number;
    fromId: string;
    toId: string;
    kind: 'parent' | 'spouse';
  }>;
  stories: Record<string, Array<{
    id: string;
    year: number | null;
    title: string | null;
    body: string | null;
    createdAt: unknown;
  }>>;
  memos: Record<string, Array<{
    id: string;
    byId: string | null;
    duration: number | null;
    title: string | null;
    recordedOn: string | null;
    objectKey: string | null;
  }>>;
  lineages: Record<string, {
    id: string;
    bridgePersonId: string;
    family: string | null;
    familyEn: string | null;
    code: string;
    linkedTreeId: string | null;
    members: unknown[];
  }>;
  photoCounts: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Core fetch wrapper
// ---------------------------------------------------------------------------

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    ...init,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'unknown' }));
    throw { error: (body as { error?: string }).error ?? 'unknown', status: res.status } as ApiError;
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// API client methods
// ---------------------------------------------------------------------------

export const apiClient = {
  health: () => api<{ ok: boolean }>('/api/health'),

  getTree: (slug: string) =>
    api<ApiTreeResponse>(`/api/tree/${encodeURIComponent(slug)}`),
};

// ---------------------------------------------------------------------------
// Data adapter: ApiTreeResponse → TreeData
// ---------------------------------------------------------------------------

/**
 * adaptTree converts the raw API response into the TreeData shape
 * consumed by TreeCanvas, ProfileDrawer, and kinship/layout libraries.
 *
 * Key transformations:
 * - people[].spouses[] (API array) → person.spouseOf (first entry, as TreeData expects)
 * - lineages keyed by bridgePersonId → externalLineages keyed by bridgePersonId
 * - stories/memos shaped to match Record<personId, ...[]>
 * - photoCounts → photos Record<personId, number>
 */
export function adaptTree(raw: ApiTreeResponse): TreeData {
  const people: Person[] = raw.people.map((p) => ({
    id: p.id,
    name: p.name ?? undefined,
    nameEn: p.nameEn ?? undefined,
    nick: p.nick ?? undefined,
    born: p.born,
    died: p.died,
    gender: (p.gender ?? 'm') as 'm' | 'f',
    hometown: p.hometown ?? undefined,
    // Deduplicate parents and spouses (seed data may produce duplicates from
    // multiple relation rows per pair)
    parents: [...new Set(p.parents ?? [])],
    spouseOf: p.spouses.length > 0 ? [...new Set(p.spouses)][0] : undefined,
    isMe: p.isMe,
    external: p.external,
  }));

  const stories: Record<string, Array<{ year: number; title: string; body: string }>> = {};
  for (const [personId, storyArr] of Object.entries(raw.stories ?? {})) {
    stories[personId] = storyArr
      .filter((s) => s.body !== null)
      .map((s) => ({
        year: s.year ?? 0,
        title: s.title ?? '',
        body: s.body ?? '',
      }));
  }

  const memos: Record<string, Array<{ by: string; duration: number; title: string; date: string }>> = {};
  for (const [personId, memoArr] of Object.entries(raw.memos ?? {})) {
    memos[personId] = memoArr.map((m) => ({
      by: m.byId ?? '',
      duration: m.duration ?? 0,
      title: m.title ?? '',
      date: m.recordedOn ?? '',
    }));
  }

  const externalLineages: Record<string, import('./types').Lineage> = {};
  for (const [bridgeId, lin] of Object.entries(raw.lineages ?? {})) {
    const previewArr = (lin.members as import('./types').LineageMember[]) ?? [];
    externalLineages[bridgeId] = {
      bridgePersonId: lin.bridgePersonId,
      family: lin.family ?? '',
      familyEn: lin.familyEn ?? '',
      code: lin.code,
      // `members` on Lineage type is total count (number); preview is the array
      members: previewArr.length,
      preview: previewArr,
      linked: Boolean(lin.linkedTreeId),
      linkedTreeId: lin.linkedTreeId ?? null,
    };
  }

  return {
    meta: {
      treeName: raw.tree.name,
      treeNameEn: raw.tree.nameEn ?? undefined,
      ownerId: raw.tree.ownerId ?? '',
    },
    people,
    stories,
    memos,
    photos: raw.photoCounts ?? {},
    externalLineages,
  };
}
