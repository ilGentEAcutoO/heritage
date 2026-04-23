/**
 * Trees.tsx — "ต้นไม้ของฉัน" — lists trees the logged-in user owns or has
 * been shared with. Requires auth; redirects to /login if not logged in.
 */

import { useState, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useSession } from '@app/hooks/useSession';
import { apiClient } from '@app/lib/api';
import type { TreeSummary } from '@app/lib/api';

const s = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: '3rem 2rem',
    fontFamily: 'Sarabun, serif',
    background: 'var(--bg, #faf8f4)',
    color: 'var(--ink, #2a1f14)',
  },
  inner: {
    width: '100%',
    maxWidth: '680px',
  },
  heading: {
    fontFamily: 'Cormorant Garamond, serif',
    fontSize: '2rem',
    fontWeight: 600 as const,
    margin: '0 0 0.25rem',
  },
  sub: {
    fontSize: '0.9rem',
    opacity: 0.55,
    margin: '0 0 2rem',
  },
  section: {
    marginBottom: '1.75rem',
  },
  sectionTitle: {
    fontSize: '0.75rem',
    fontWeight: 600 as const,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    opacity: 0.5,
    margin: '0 0 0.6rem',
    paddingBottom: '0.4rem',
    borderBottom: '1px solid var(--line, #e4ddd4)',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.7rem 0',
    borderBottom: '1px solid var(--line, #e4ddd4)',
  },
  name: {
    flex: 1,
    fontSize: '1rem',
    fontWeight: 500 as const,
    textDecoration: 'none',
    color: 'var(--ink, #2a1f14)',
  },
  badge: (role: string) => ({
    fontSize: '0.7rem',
    fontWeight: 600 as const,
    letterSpacing: '0.04em',
    padding: '0.2rem 0.55rem',
    borderRadius: '99px',
    background:
      role === 'owner'
        ? 'var(--leaf, #6b8f5e)'
        : role === 'editor'
        ? 'var(--blossom, #c4855a)'
        : '#9aa3a2',
    color: '#fff',
    textTransform: 'capitalize' as const,
    whiteSpace: 'nowrap' as const,
  }),
  empty: {
    opacity: 0.45,
    fontSize: '0.9rem',
    padding: '1rem 0',
  },
  error: {
    background: '#fef2f2',
    border: '1px solid #fca5a5',
    borderRadius: '5px',
    padding: '0.65rem 0.8rem',
    fontSize: '0.875rem',
    color: '#991b1b',
    margin: '1rem 0',
  },
  homeLink: {
    display: 'inline-block',
    marginBottom: '1.5rem',
    fontSize: '0.85rem',
    color: 'var(--leaf, #6b8f5e)',
    textDecoration: 'none',
    opacity: 0.8,
  },
};

function roleThai(role: string): string {
  if (role === 'owner') return 'เจ้าของ';
  if (role === 'editor') return 'แก้ไขได้';
  return 'ดูได้';
}

export function Trees() {
  const { user, loading: sessionLoading } = useSession();
  const [trees, setTrees] = useState<TreeSummary[]>([]);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (sessionLoading || !user) return;
    setFetchLoading(true);
    apiClient
      .listTrees()
      .then(({ trees: t }) => setTrees(t))
      .catch(() => setErrorMsg('โหลดรายการต้นไม้ไม่ได้ — ลองใหม่อีกครั้ง'))
      .finally(() => setFetchLoading(false));
  }, [sessionLoading, user]);

  // Not resolved yet — keep blank to avoid flash
  if (sessionLoading) return null;

  // Not logged in → redirect
  if (!user) return <Navigate to="/login" replace />;

  const owned = trees.filter((t) => t.role === 'owner');
  const shared = trees.filter((t) => t.role !== 'owner');

  return (
    <div style={s.page}>
      <div style={s.inner}>
        <Link to="/" style={s.homeLink}>← หน้าหลัก</Link>

        <h1 style={s.heading}>ต้นไม้ของฉัน</h1>
        <p style={s.sub}>{user.displayName ?? user.email}</p>

        {errorMsg && <div style={s.error}>{errorMsg}</div>}

        {fetchLoading ? (
          <p style={{ opacity: 0.4, fontFamily: 'Sarabun, serif' }}>กำลังโหลด…</p>
        ) : (
          <>
            {/* Owned trees */}
            <div style={s.section}>
              <div style={s.sectionTitle}>ที่เป็นเจ้าของ</div>
              {owned.length === 0 ? (
                <p style={s.empty}>ยังไม่มีต้นไม้</p>
              ) : (
                owned.map((t) => <TreeRow key={t.id} tree={t} />)
              )}
            </div>

            {/* Shared with me */}
            {shared.length > 0 && (
              <div style={s.section}>
                <div style={s.sectionTitle}>ที่แชร์กับฉัน</div>
                {shared.map((t) => <TreeRow key={t.id} tree={t} />)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TreeRow({ tree }: { tree: TreeSummary }) {
  return (
    <div style={s.row}>
      <Link to={`/tree/${tree.slug}`} style={s.name}>
        {tree.name}
        {tree.name_en && (
          <span style={{ opacity: 0.45, fontWeight: 400, marginLeft: '0.4rem', fontSize: '0.9em' }}>
            · {tree.name_en}
          </span>
        )}
      </Link>
      <span style={s.badge(tree.role)} title={tree.role}>
        {roleThai(tree.role)}
      </span>
    </div>
  );
}
