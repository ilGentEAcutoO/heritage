/**
 * tree.ts — /api/tree/* read-only routes
 *
 * Public:
 *   GET /api/tree/:slug  → full tree snapshot (TreeQueryResult)
 *
 * Private trees (is_public = false) are treated as not found (404) — matches
 * /api/img/* which returns 403 for private-tree photos. Login is removed, so
 * private trees are intentionally unreachable in this phase.
 */

import { Hono } from 'hono';
import type { HonoEnv } from '../types';
import { getTreeData } from '../lib/tree-query';

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const treeRouter = new Hono<HonoEnv>();

// ---------------------------------------------------------------------------
// GET /api/tree/:slug  — public read-only (is_public gated)
// ---------------------------------------------------------------------------

treeRouter.get('/:slug', async (c) => {
  const db = c.var.db;
  const { slug } = c.req.param();

  const data = await getTreeData(db, slug);
  if (!data) return c.json({ error: 'not found' }, 404);
  if (!data.tree.isPublic) return c.json({ error: 'not found' }, 404);

  return c.json(data);
});
