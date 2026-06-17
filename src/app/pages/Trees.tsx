/**
 * Trees.tsx — "ต้นไม้ของฉัน" — lists trees the logged-in user owns or has
 * been shared with. Requires auth; redirects to /login if not logged in.
 */

import { useState, useEffect } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useSession } from '@app/hooks/useSession';
import { apiClient } from '@app/lib/api';
import type { TreeSummary } from '@app/lib/api';
import { CreateTreeDialog } from '@app/components/CreateTreeDialog';

const FONT = '"Prompt", system-ui, sans-serif';
const s = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: '3rem 2rem',
    fontFamily: FONT,
    background: 'radial-gradient(80% 50% at 50% 0%, var(--paper) 0%, var(--bg) 70%)',
    color: 'var(--ink)',
  },
  inner: {
    width: '100%',
    maxWidth: '680px',
  },
  heading: {
    fontFamily: FONT,
    fontSize: '1.9rem',
    fontWeight: 600 as const,
    margin: '0 0 0.2rem',
    letterSpacing: '-0.01em',
  },
  sub: {
    fontSize: '0.9rem',
    color: 'var(--ink-faint)',
    margin: '0 0 2rem',
  },
  section: {
    marginBottom: '1.75rem',
  },
  sectionTitle: {
    fontSize: '0.72rem',
    fontWeight: 600 as const,
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    color: 'var(--ink-faint)',
    margin: '0 0 0.75rem',
  },
  empty: {
    color: 'var(--ink-faint)',
    fontSize: '0.9rem',
    padding: '0.5rem 0',
  },
  homeLink: {
    display: 'inline-block',
    marginBottom: '1.5rem',
    fontSize: '0.85rem',
    color: 'var(--ink-soft)',
    textDecoration: 'none',
  },
  headerRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '1rem',
    marginBottom: '2rem',
  },
  createBtn: {
    flexShrink: 0,
    padding: '0.65rem 1.3rem',
    borderRadius: '999px',
    border: 'none',
    background: 'var(--accent-grad)',
    color: '#fff',
    cursor: 'pointer',
    fontFamily: FONT,
    fontSize: '0.9rem',
    fontWeight: 600 as const,
    boxShadow: '0 4px 14px rgba(12,166,120,.3)',
    whiteSpace: 'nowrap' as const,
  },
};

function roleThai(role: string): string {
  if (role === 'owner') return 'เจ้าของ';
  if (role === 'editor') return 'แก้ไขได้';
  return 'ดูได้';
}

export function Trees() {
  const { user, loading: sessionLoading } = useSession();
  const navigate = useNavigate();
  const [trees, setTrees] = useState<TreeSummary[]>([]);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

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

        <div style={s.headerRow}>
          <div>
            <h1 style={s.heading}>ต้นไม้ของฉัน</h1>
            <p style={s.sub}>{user.displayName ?? user.email}</p>
          </div>
          <button
            type="button"
            data-testid="create-tree-button"
            style={s.createBtn}
            onClick={() => setDialogOpen(true)}
          >
            + สร้างต้นไม้ใหม่
          </button>
        </div>

        {errorMsg && <div className="form-error" role="alert">{errorMsg}</div>}

        {fetchLoading ? (
          <p style={{ color: 'var(--ink-faint)', fontFamily: FONT }} aria-live="polite">กำลังโหลด…</p>
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

      {dialogOpen && (
        <CreateTreeDialog
          onClose={() => setDialogOpen(false)}
          onCreated={(tree) => navigate(`/tree/${tree.slug}`)}
        />
      )}
    </div>
  );
}

function TreeRow({ tree }: { tree: TreeSummary }) {
  const badgeClass =
    tree.role === 'owner' ? 'owner' : tree.role === 'editor' ? 'editor' : '';
  return (
    <Link to={`/tree/${tree.slug}`} className="tree-row">
      <span className="tree-row-name">
        {tree.name}
        {tree.name_en && (
          <span className="tree-row-name-en">· {tree.name_en}</span>
        )}
      </span>
      <span className={`tree-row-badge ${badgeClass}`.trim()} title={tree.role}>
        {roleThai(tree.role)}
      </span>
    </Link>
  );
}
