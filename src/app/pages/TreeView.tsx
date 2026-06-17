/**
 * TreeView.tsx — the main tree page.
 *
 * Orchestrates: Sidebar + TreeCanvas + ActiveViewPill + ProfileDrawer
 *               + PathFinder + TweaksPanel.
 *
 * Used for both the anonymous demo (/demo/wongsuriya) and auth'd trees (/tree/:slug).
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';

import { useTree } from '@app/hooks/useTree';
import { useTweaks } from '@app/hooks/useTweaks';
import { computeRelation, findPath } from '@app/lib/kinship';
import { useSession } from '@app/hooks/useSession';
import { apiClient } from '@app/lib/api';
import { paletteStyle } from '@app/lib/palettes';

import { TreeCanvas } from '@app/components/TreeCanvas';
import { ProfileDrawer } from '@app/components/ProfileDrawer';
import { PathFinder } from '@app/components/PathFinder';
import { ShareDialog } from '@app/components/ShareDialog';

// Components that may not yet be in the barrel — import directly
import { Sidebar } from '@app/components/Sidebar';
import { ActiveViewPill } from '@app/components/ActiveViewPill';
import { TweaksPanel } from '@app/components/TweaksPanel';
import { UserMenu } from '@app/components/UserMenu';
import { AddPersonDialog } from '@app/components/AddPersonDialog';
import { ThemePicker } from '@app/components/ThemePicker';
import { NodeStylePicker } from '@app/components/NodeStylePicker';
import type { NodeStyleValue } from '@app/components/NodeStylePicker';

interface TreeViewProps {
  /** Passed directly for fixed-slug routes (e.g. /demo/wongsuriya). */
  treeSlug?: string;
}

export function TreeView({ treeSlug }: TreeViewProps) {
  // React Router provides :slug for /tree/:slug routes
  const { slug: routeSlug } = useParams<{ slug: string }>();
  const slug = treeSlug ?? routeSlug;

  const { data, loading, error, refetch } = useTree(slug);
  const { tweaks, updateTweak } = useTweaks();
  const { user, loading: sessionLoading } = useSession();

  // UI state
  const [selectedId, setSelectedId] = useState<string | null>('p12');
  const [query, setQuery] = useState('');
  const [showPath, setShowPath] = useState(false);
  const [pathTarget, setPathTarget] = useState<string | null>(null);
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [expandedLineages, setExpandedLineages] = useState<Set<string>>(new Set());
  const [shareOpen, setShareOpen] = useState(false);
  const [addPersonOpen, setAddPersonOpen] = useState(false);

  // Mobile nav state
  const [navOpen, setNavOpen] = useState(false);
  const navToggleRef = useRef<HTMLButtonElement>(null);

  // Unified close helper: always returns focus to the hamburger.
  // NOT used for person-select (that opens the ProfileDrawer, so focus should
  // go there, not back to the toggle).
  const closeNav = useCallback(() => {
    setNavOpen(false);
    navToggleRef.current?.focus();
  }, []);

  // ESC closes mobile nav; listener is only active while nav is open
  useEffect(() => {
    if (!navOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeNav();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [navOpen, closeNav]);

  // Move focus into the sidebar search input when the nav opens so keyboard
  // users can immediately type a name. A full focus trap is out of scope for
  // this drawer — ESC and backdrop-click return focus to the toggle.
  useEffect(() => {
    if (!navOpen) return;
    const input = document.getElementById('sidebar-nav')?.querySelector<HTMLElement>('input');
    input?.focus();
  }, [navOpen]);

  // Local theme preview for non-owners (e.g. demo visitors): lets anyone try
  // the palettes without persisting. `undefined` = no preview (use stored theme).
  const [previewTheme, setPreviewTheme] = useState<string | null | undefined>(undefined);

  // Local node style preview for non-owners: lets anyone try shapes without persisting.
  // `undefined` = no preview (use stored nodeStyle, then fall back to tweaks.nodeShape).
  const [previewNodeStyle, setPreviewNodeStyle] = useState<NodeStyleValue | null | undefined>(undefined);

  // Optimistic local overrides for person status (deceased / died)
  const [statusOverrides, setStatusOverrides] = useState<Record<string, { deceased: boolean; died: number | null }>>({});

  // canEdit: current user is the tree owner
  const canEdit = !!user && !!data?.meta.ownerId && user.id === data.meta.ownerId;

  // Merged people list: applies optimistic statusOverrides on top of server data
  const mergedPeople = useMemo(
    () =>
      data
        ? data.people.map((p) =>
            statusOverrides[p.id] ? { ...p, ...statusOverrides[p.id] } : p,
          )
        : [],
    [data, statusOverrides],
  );

  // onSetStatus: optimistic update + optional persist for owner
  const onSetStatus = useCallback(
    (personId: string, deceased: boolean, died: number | null) => {
      const override = { deceased, died };
      setStatusOverrides((prev) => ({ ...prev, [personId]: override }));
      if (canEdit && slug) {
        apiClient
          .setPersonStatus(slug, personId, { deceased, died })
          .catch(() => {
            // Revert only this person's override on failure
            setStatusOverrides((prev) => {
              const next = { ...prev };
              delete next[personId];
              return next;
            });
          });
      }
      // If !canEdit: local-only ephemeral change, no network call
    },
    [canEdit, slug],
  );

  // onUpdatePerson: PATCH person then refetch
  const onUpdatePerson = useCallback(
    async (
      personId: string,
      patch: Partial<{ name: string; nameEn: string | null; nick: string | null; born: number | null; hometown: string | null; gender: 'm' | 'f'; deceased: boolean; died: number | null }>,
    ) => {
      if (!canEdit || !slug) return;
      await apiClient.updatePerson(slug, personId, patch);
      refetch();
    },
    [canEdit, slug, refetch],
  );

  // onDeletePerson: DELETE person then refetch and deselect
  const onDeletePerson = useCallback(
    async (personId: string) => {
      if (!canEdit || !slug) return;
      await apiClient.deletePerson(slug, personId);
      setSelectedId(null);
      refetch();
    },
    [canEdit, slug, refetch],
  );

  // onUploadPhoto: POST multipart photo then refetch
  const onUploadPhoto = useCallback(
    async (personId: string, file: File) => {
      if (!canEdit || !slug) return;
      await apiClient.uploadPhoto(slug, personId, file);
      refetch();
    },
    [canEdit, slug, refetch],
  );

  // onDeletePhoto: DELETE photo then refetch
  const onDeletePhoto = useCallback(
    async (personId: string, photoId: string) => {
      if (!canEdit || !slug) return;
      await apiClient.deletePhoto(slug, personId, photoId);
      refetch();
    },
    [canEdit, slug, refetch],
  );

  // onSetTheme: PATCH theme (owner only) then refetch so all viewers get the update
  const onSetTheme = useCallback(
    async (theme: string | null) => {
      if (!canEdit || !slug) return;
      await apiClient.setTheme(slug, theme);
      refetch();
    },
    [canEdit, slug, refetch],
  );

  // handleSelectTheme: owner persists (PATCH); everyone else gets an ephemeral
  // local preview (no network) so demo/non-owner viewers can try the palettes.
  const handleSelectTheme = useCallback(
    (theme: string | null) => {
      if (canEdit) {
        setPreviewTheme(undefined); // owner persists; drop any stale preview
        void onSetTheme(theme);
      } else {
        setPreviewTheme(theme); // local-only preview, resets on reload
      }
    },
    [canEdit, onSetTheme],
  );

  // onSetNodeStyle: PATCH node-style (owner only) then refetch
  const onSetNodeStyle = useCallback(
    async (nodeStyle: NodeStyleValue | null) => {
      if (!canEdit || !slug) return;
      await apiClient.setNodeStyle(slug, nodeStyle);
      refetch();
    },
    [canEdit, slug, refetch],
  );

  // handleSelectNodeStyle: owner persists (PATCH); everyone else gets an ephemeral
  // local preview (no network) so demo/non-owner viewers can try the shapes.
  const handleSelectNodeStyle = useCallback(
    (nodeStyle: NodeStyleValue | null) => {
      if (canEdit) {
        setPreviewNodeStyle(undefined); // owner persists; drop any stale preview
        void onSetNodeStyle(nodeStyle);
      } else {
        setPreviewNodeStyle(nodeStyle); // local-only preview, resets on reload
      }
    },
    [canEdit, onSetNodeStyle],
  );

  // Derived from data
  const meId = useMemo(
    () => mergedPeople.find((p) => p.isMe)?.id ?? null,
    [mergedPeople],
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
    return findPath(mergedPeople, meId, pathTarget);
  }, [showPath, pathTarget, data, mergedPeople, meId]);

  // Sidebar filtering
  const filteredPeople = useMemo(() => {
    if (!data) return [];
    if (!query) return mergedPeople;
    const q = query.toLowerCase();
    return mergedPeople.filter(
      (p) =>
        (p.name ?? '').toLowerCase().includes(q) ||
        (p.nick ?? '').toLowerCase().includes(q) ||
        (p.nameEn ?? '').toLowerCase().includes(q),
    );
  }, [data, mergedPeople, query]);

  // Stats
  const stats = useMemo(() => {
    if (!data) return { total: 0, generations: 0, alive: 0, photos: 0 };
    const total = mergedPeople.length;
    const alive = mergedPeople.filter((p) => !p.deceased).length;
    const photos = Object.values(data.photos ?? {}).reduce(
      (acc, n) => acc + n,
      0,
    );
    // Real generation depth = longest parent chain (memoized DFS, cycle-safe).
    const byId = new Map(mergedPeople.map((p) => [p.id, p]));
    const depthCache = new Map<string, number>();
    const depthOf = (id: string, seen: Set<string>): number => {
      const cached = depthCache.get(id);
      if (cached !== undefined) return cached;
      if (seen.has(id)) return 1; // guard against malformed cyclic parent links
      const parents = (byId.get(id)?.parents ?? []).filter((pid) => byId.has(pid));
      let d = 1;
      if (parents.length) {
        seen.add(id);
        d = 1 + Math.max(...parents.map((pid) => depthOf(pid, seen)));
        seen.delete(id);
      }
      depthCache.set(id, d);
      return d;
    };
    const generations = total
      ? Math.max(...mergedPeople.map((p) => depthOf(p.id, new Set())))
      : 0;
    return { total, generations, alive, photos };
  }, [data, mergedPeople]);

  // Selected person (from mergedPeople so status overrides are reflected)
  const selected = useMemo(
    () => mergedPeople.find((p) => p.id === selectedId) ?? null,
    [mergedPeople, selectedId],
  );

  // ---------------------------------------------------------------------------
  // Loading / error states
  // ---------------------------------------------------------------------------

  if (!slug) {
    return (
      <div style={{ padding: '2rem', fontFamily: '"Prompt", system-ui, sans-serif' }}>
        ไม่พบ tree slug
      </div>
    );
  }

  // Only show the full-screen loader on the INITIAL load (no data yet). On a
  // refetch() after a mutation, keep the current view mounted and update in
  // place — otherwise the whole tree (incl. the open ProfileDrawer/tab) would
  // unmount and remount, losing UI state (e.g. the selected Photos tab).
  if (loading && !data) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: '"Prompt", system-ui, sans-serif',
          background: 'var(--bg)',
        }}
      >
        <p style={{ opacity: 0.5 }}>กำลังโหลด…</p>
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
          fontFamily: '"Prompt", system-ui, sans-serif',
          background: 'var(--bg)',
          color: 'var(--ink)',
          gap: '1rem',
          padding: '2rem',
          textAlign: 'center',
        }}
      >
        <h1
          style={{
            fontFamily: '"Prompt", system-ui, sans-serif',
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
            background: 'var(--leaf)',
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
          style={{ color: 'var(--leaf)', fontSize: '0.9rem', opacity: 0.8 }}
        >
          กลับหน้าหลัก
        </Link>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const totalPeople = mergedPeople.length;
  const aliveCount = mergedPeople.filter((p) => !p.deceased).length;

  // A non-owner's local preview (if any) takes precedence over the stored theme.
  const effectiveTheme = previewTheme !== undefined ? previewTheme : data.meta.theme;

  // Tree-level node style: preview > stored > viewer's local tweak (tweaks.nodeShape).
  const effectiveNodeStyle = (
    (previewNodeStyle !== undefined ? previewNodeStyle : data.meta.nodeStyle) ?? tweaks.nodeShape
  ) as NodeStyleValue;

  return (
    <div className={`app${effectiveNodeStyle && effectiveNodeStyle !== 'circle' ? ` shape-${effectiveNodeStyle}` : ''}`} style={paletteStyle(effectiveTheme)}>
      {/* Header */}
      <header className="app-header" data-screen-label="App Header">
        {/* Hamburger — visible only on mobile (≤820px), hidden on desktop via CSS */}
        <button
          ref={navToggleRef}
          type="button"
          className="nav-toggle"
          data-testid="nav-toggle"
          aria-label="เมนู"
          aria-expanded={navOpen}
          aria-controls="sidebar-nav"
          onClick={() => setNavOpen((s) => !s)}
        >
          <span className="nav-toggle-bar" />
          <span className="nav-toggle-bar" />
          <span className="nav-toggle-bar" />
        </button>

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
            My Tree · {totalPeople} people · {stats.generations} generations
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
          {/* Theme picker — everyone can try palettes; owner persists, others
              get an ephemeral local preview (previewOnly). */}
          <ThemePicker
            currentTheme={effectiveTheme}
            onSelect={handleSelectTheme}
            previewOnly={!canEdit}
          />
          {/* Node style picker — everyone can preview shapes; owner persists. */}
          <NodeStylePicker
            currentNodeStyle={effectiveNodeStyle}
            onSelect={handleSelectNodeStyle}
            previewOnly={!canEdit}
          />
          {/* Share button — shown only to the tree owner */}
          {user && data?.meta.ownerId && user.id === data.meta.ownerId && (
            <button
              className="header-btn"
              onClick={() => setShareOpen(true)}
              title="จัดการการแชร์"
              style={{ color: 'var(--leaf)' }}
            >
              แชร์
            </button>
          )}
          <button
            className="header-btn"
            onClick={() => setTweaksOpen((s) => !s)}
            title="ปรับแต่ง"
            aria-label="ปรับแต่ง"
            aria-expanded={tweaksOpen}
          >
            ⚙
          </button>
          {sessionLoading ? null : user ? (
            <UserMenu />
          ) : (
            <Link
              to="/login"
              className="header-btn"
              data-testid="header-login"
              style={{ background: 'var(--leaf)', color: '#fff', textDecoration: 'none', fontWeight: 500 }}
            >
              เข้าสู่ระบบ
            </Link>
          )}
        </div>
      </header>

      {/* Mobile backdrop — only in DOM while nav is open; click closes nav */}
      {navOpen && (
        <div
          className="nav-backdrop"
          onClick={closeNav}
        />
      )}

      {/* Sidebar */}
      <Sidebar
        data={data}
        selectedId={selectedId}
        onSelect={(id) => {
          setSelectedId(id);
          // Close only (no focus return) — ProfileDrawer receives focus next
          setNavOpen(false);
        }}
        query={query}
        onQueryChange={setQuery}
        filteredPeople={filteredPeople}
        stats={stats}
        onAddPerson={canEdit ? () => setAddPersonOpen(true) : undefined}
        open={navOpen}
      />

      {/* Tree canvas */}
      <TreeCanvas
        data={{ ...data, people: mergedPeople }}
        onSelect={setSelectedId}
        selectedId={selectedId}
        highlightPath={highlightPath}
        layoutStyle={tweaks.showTrunk ? 'organic' : 'plain'}
        labelMode={activeViewId ? 'relation' : 'name'}
        activeViewId={activeViewId}
        expandedLineages={expandedLineages}
        onToggleLineage={toggleLineage}
      />

      {/* Active view pill */}
      <ActiveViewPill
        people={mergedPeople}
        activeViewId={activeViewId}
        meId={meId ?? ''}
        onChange={setActiveViewId}
      />

      {/* Profile drawer */}
      {selected && (
        <ProfileDrawer
          // Remount per person so per-person UI state (photoError, edit mode,
          // delete confirm) never leaks onto the next person on a jump.
          key={selected.id}
          person={selected}
          data={{ ...data, people: mergedPeople }}
          onClose={() => setSelectedId(null)}
          onJumpTo={(id) => setSelectedId(id)}
          expandedLineages={expandedLineages}
          onToggleLineage={toggleLineage}
          onSetActiveView={setActiveViewId}
          isActiveView={selected.id === activeViewId}
          onSetStatus={onSetStatus}
          canEdit={canEdit}
          onUpdatePerson={canEdit ? onUpdatePerson : undefined}
          onDeletePerson={canEdit ? onDeletePerson : undefined}
          onUploadPhoto={canEdit ? onUploadPhoto : undefined}
          onDeletePhoto={canEdit ? onDeletePhoto : undefined}
        />
      )}

      {/* PathFinder */}
      {showPath && meId && (
        <PathFinder
          data={{ ...data, people: mergedPeople }}
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

      {/* Add person dialog — owner only */}
      {addPersonOpen && canEdit && slug && (
        <AddPersonDialog
          slug={slug}
          relativeTo={selected ?? null}
          onClose={() => setAddPersonOpen(false)}
          onCreated={(newPerson) => {
            setAddPersonOpen(false);
            refetch();
            // Select the newly created person after refetch
            setSelectedId(newPerson.id);
          }}
        />
      )}
    </div>
  );
}
