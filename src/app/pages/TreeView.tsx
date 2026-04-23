/**
 * TreeView.tsx — the main tree page.
 *
 * Orchestrates: Sidebar + TreeCanvas + ActiveViewPill + ProfileDrawer
 *               + PathFinder + TweaksPanel.
 *
 * Used for both the anonymous demo (/demo/wongsuriya) and auth'd trees (/tree/:slug).
 */

import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';

import { useTree } from '@app/hooks/useTree';
import { useTweaks } from '@app/hooks/useTweaks';
import { computeRelation, findPath } from '@app/lib/kinship';
import { useSession } from '@app/hooks/useSession';

import { TreeCanvas } from '@app/components/TreeCanvas';
import { ProfileDrawer } from '@app/components/ProfileDrawer';
import { PathFinder } from '@app/components/PathFinder';
import { ShareDialog } from '@app/components/ShareDialog';

// Components that may not yet be in the barrel — import directly
import { Sidebar } from '@app/components/Sidebar';
import { ActiveViewPill } from '@app/components/ActiveViewPill';
import { TweaksPanel } from '@app/components/TweaksPanel';

interface TreeViewProps {
  /** Passed directly for fixed-slug routes (e.g. /demo/wongsuriya). */
  treeSlug?: string;
}

export function TreeView({ treeSlug }: TreeViewProps) {
  // React Router provides :slug for /tree/:slug routes
  const { slug: routeSlug } = useParams<{ slug: string }>();
  const slug = treeSlug ?? routeSlug;

  const { data, loading, error } = useTree(slug);
  const { tweaks, updateTweak } = useTweaks();
  const { user } = useSession();

  // UI state
  const [selectedId, setSelectedId] = useState<string | null>('p12');
  const [query, setQuery] = useState('');
  const [showPath, setShowPath] = useState(false);
  const [pathTarget, setPathTarget] = useState<string | null>(null);
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [expandedLineages, setExpandedLineages] = useState<Set<string>>(new Set());
  const [shareOpen, setShareOpen] = useState(false);

  // Derived from data
  const meId = useMemo(
    () => data?.people.find((p) => p.isMe)?.id ?? null,
    [data],
  );

  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  // Set initial POV to "me" once data is loaded
  useMemo(() => {
    if (meId && activeViewId === null) {
      setActiveViewId(meId);
    }
    // Only re-run when meId changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meId]);

  const toggleLineage = (personId: string) => {
    setExpandedLineages((prev) => {
      const next = new Set(prev);
      if (next.has(personId)) next.delete(personId);
      else next.add(personId);
      return next;
    });
  };

  // Highlight path for "how are we related?"
  const highlightPath = useMemo<string[] | null>(() => {
    if (!showPath || !pathTarget || !data || !meId) return null;
    return findPath(data.people, meId, pathTarget);
  }, [showPath, pathTarget, data, meId]);

  // Sidebar filtering
  const filteredPeople = useMemo(() => {
    if (!data) return [];
    if (!query) return data.people;
    const q = query.toLowerCase();
    return data.people.filter(
      (p) =>
        (p.name ?? '').toLowerCase().includes(q) ||
        (p.nick ?? '').toLowerCase().includes(q) ||
        (p.nameEn ?? '').toLowerCase().includes(q),
    );
  }, [data, query]);

  // Stats
  const stats = useMemo(() => {
    if (!data) return { total: 0, generations: 0, alive: 0, photos: 0 };
    const total = data.people.length;
    const alive = data.people.filter((p) => !p.died).length;
    const photos = Object.values(data.photos ?? {}).reduce(
      (acc, n) => acc + n,
      0,
    );
    // Rough generation count: distinct born-decade buckets
    const generations = 4; // known from data; could compute from layout
    return { total, generations, alive, photos };
  }, [data]);

  // Selected person
  const selected = useMemo(
    () => data?.people.find((p) => p.id === selectedId) ?? null,
    [data, selectedId],
  );

  // ---------------------------------------------------------------------------
  // Loading / error states
  // ---------------------------------------------------------------------------

  if (!slug) {
    return (
      <div style={{ padding: '2rem', fontFamily: 'Sarabun, serif' }}>
        ไม่พบ tree slug
      </div>
    );
  }

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Sarabun, serif',
          background: 'var(--bg, #faf8f4)',
        }}
      >
        <p style={{ opacity: 0.5 }}>กำลังโหลด...</p>
      </div>
    );
  }

  if (error || !data) {
    const is404 = !error || error.status === 404;
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Sarabun, serif',
          background: 'var(--bg, #faf8f4)',
          color: 'var(--ink, #2a1f14)',
          gap: '1rem',
          padding: '2rem',
          textAlign: 'center',
        }}
      >
        <h1
          style={{
            fontFamily: 'Cormorant Garamond, serif',
            fontSize: '2rem',
            fontWeight: 600,
            margin: 0,
          }}
        >
          ต้นไม้ไม่พบ / Tree not found
        </h1>
        <p style={{ margin: 0, opacity: 0.6, fontSize: '1rem', maxWidth: '360px' }}>
          {is404
            ? 'ไม่พบต้นไม้ที่ขอ — ลองดูตัวอย่างต้นไม้วงศ์สุริยะได้เลย'
            : 'เกิดข้อผิดพลาดในการโหลดข้อมูล — ลองดูตัวอย่างต้นไม้วงศ์สุริยะได้เลย'}
        </p>
        <Link
          to="/demo/wongsuriya"
          style={{
            padding: '0.65rem 1.5rem',
            borderRadius: '6px',
            background: 'var(--leaf, #6b8f5e)',
            color: '#fff',
            textDecoration: 'none',
            fontWeight: 500,
            fontSize: '0.95rem',
          }}
        >
          ดู demo tree → วงศ์สุริยะ
        </Link>
        <Link
          to="/"
          style={{ color: 'var(--leaf, #6b8f5e)', fontSize: '0.9rem', opacity: 0.8 }}
        >
          กลับหน้าหลัก
        </Link>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const totalPeople = data.people.length;
  const aliveCount = data.people.filter((p) => !p.died).length;

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header" data-screen-label="App Header">
        <div className="header-logo">
          <svg className="logo-mark" viewBox="0 0 28 28" aria-hidden="true">
            <path
              d="M14 26 Q14 18 8 14 Q4 12 6 8 Q10 6 14 10 Q18 6 22 8 Q24 12 20 14 Q14 18 14 26"
              fill="var(--leaf)"
              opacity={0.4}
            />
            <circle cx="14" cy="10" r="3" fill="var(--blossom)" />
            <path d="M14 13 L14 26" stroke="var(--bark)" strokeWidth={1.5} />
          </svg>
          Heritage
          <small>v0.3</small>
        </div>

        <div className="tree-title">
          <div className="tree-title-kicker">
            My Tree · {totalPeople} people · 4 generations
          </div>
          <div className="tree-title-name">
            {data.meta.treeName}
            {data.meta.treeNameEn && (
              <>
                {' '}
                ·{' '}
                <em style={{ opacity: 0.6 }}>{data.meta.treeNameEn}</em>
              </>
            )}
          </div>
        </div>

        <div className="header-actions">
          <button
            className="header-btn"
            onClick={() => setShowPath((s) => !s)}
          >
            <span style={{ opacity: 0.6 }}>◈</span> เราเกี่ยวกันยังไง?
          </button>
          {/* Share button — shown only to the tree owner */}
          {user && data?.meta.ownerId && user.id === data.meta.ownerId && (
            <button
              className="header-btn"
              onClick={() => setShareOpen(true)}
              title="จัดการการแชร์"
              style={{ color: 'var(--leaf, #6b8f5e)' }}
            >
              แชร์
            </button>
          )}
          <button
            className="header-btn"
            onClick={() => setTweaksOpen((s) => !s)}
            title="Tweaks"
          >
            ⚙
          </button>
        </div>
      </header>

      {/* Sidebar */}
      <Sidebar
        data={data}
        selectedId={selectedId}
        onSelect={setSelectedId}
        query={query}
        onQueryChange={setQuery}
        filteredPeople={filteredPeople}
        stats={stats}
      />

      {/* Tree canvas */}
      <TreeCanvas
        data={data}
        onSelect={setSelectedId}
        selectedId={selectedId}
        highlightPath={highlightPath}
        layoutStyle={tweaks.showTrunk ? 'organic' : 'plain'}
        nodeStyle={tweaks.nodeShape}
        labelMode={activeViewId ? 'relation' : 'name'}
        activeViewId={activeViewId}
        expandedLineages={expandedLineages}
        onToggleLineage={toggleLineage}
      />

      {/* Active view pill */}
      <ActiveViewPill
        people={data.people}
        activeViewId={activeViewId}
        meId={meId ?? ''}
        onChange={setActiveViewId}
      />

      {/* Profile drawer */}
      {selected && (
        <ProfileDrawer
          person={selected}
          data={data}
          onClose={() => setSelectedId(null)}
          onJumpTo={(id) => setSelectedId(id)}
          expandedLineages={expandedLineages}
          onToggleLineage={toggleLineage}
        />
      )}

      {/* PathFinder */}
      {showPath && meId && (
        <PathFinder
          data={data}
          meId={meId}
          targetId={pathTarget}
          onTarget={setPathTarget}
          onClose={() => {
            setShowPath(false);
            setPathTarget(null);
          }}
        />
      )}

      {/* Tweaks panel */}
      <TweaksPanel
        open={tweaksOpen}
        tweaks={tweaks}
        onChange={(key, value) =>
          updateTweak(key as keyof typeof tweaks, value as never)
        }
      />

      {/* Share dialog — owner only; only rendered when data is available */}
      {shareOpen && data && slug && (
        <ShareDialog
          slug={slug}
          currentVisibility={data.meta.visibility ?? 'public'}
          open={shareOpen}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  );
}
