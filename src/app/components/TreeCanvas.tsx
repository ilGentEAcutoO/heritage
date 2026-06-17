/**
 * TreeCanvas.tsx
 * Port of TreeView from /tmp/design_bundle/family-tree/project/tree-view.jsx
 *
 * Features:
 * - Pan/zoom via wheel + mouse drag on canvas
 * - Per-node drag with 3px threshold; position overrides persisted to localStorage
 * - SVG edges: parent-child curves via branchPath; spouse links dashed; leaf decorations
 * - Lineage edges: dashed var(--leaf), width 2, opacity 0.55
 * - Highlight path: pathIds from highlightPath prop; matching edges use var(--blossom), width 4
 * - Zoom controls bottom-right with reset button when overrides exist
 */

import { useState, useMemo, useRef, useEffect } from 'react';
import { z } from 'zod';
import type { TreeData } from '@app/lib/types';
import { layoutTree, branchPath, toLayoutPerson } from '@app/lib/layout';
import type { LayoutPerson, Lineage as LayoutLineage } from '@app/lib/layout';
import { computeRelation } from '@app/lib/kinship';
import { readLocal, writeLocal } from '@app/lib/storage';
import { PersonNode } from './PersonNode';
import { LineageNode } from './LineageNode';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface TreeCanvasProps {
  data: TreeData;
  onSelect: (id: string) => void;
  selectedId: string | null;
  highlightPath: string[] | null;
  layoutStyle: 'organic' | 'plain';
  labelMode: 'name' | 'relation';
  activeViewId: string | null;
  expandedLineages: Set<string>;
  onToggleLineage: (personId: string) => void;
}

interface Transform {
  x: number;
  y: number;
  k: number;
}

interface NodeDragState {
  id: string;
  mouseX: number;
  mouseY: number;
  startDx: number;
  startDy: number;
  moved: boolean;
}

interface PanDragState {
  x: number;
  y: number;
}

type Overrides = Record<string, { dx: number; dy: number }>;

const OVERRIDES_KEY = 'heritage-node-overrides';
const OverridesSchema = z.record(z.string(), z.object({ dx: z.number(), dy: z.number() }));

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────

export function TreeCanvas({
  data,
  onSelect,
  selectedId,
  highlightPath,
  labelMode,
  activeViewId,
  expandedLineages,
  onToggleLineage,
}: TreeCanvasProps) {
  // ── Layout ────────────────────────────────────────────────────────────────
  const layoutPeople = data.people.map(toLayoutPerson).filter((p): p is LayoutPerson => p !== null);
  // Cast externalLineages to layout.ts's Lineage map type
  const layoutLineages = data.externalLineages as
    | Record<string, LayoutLineage>
    | undefined;

  const { positions, W, H, lineageNodes, lineageEdges, lineageSpouse } = useMemo(
    () => layoutTree(layoutPeople, layoutLineages, expandedLineages),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, expandedLineages],
  );

  const idToPerson = useMemo(
    () => Object.fromEntries(data.people.map(p => [p.id, p])),
    [data],
  );

  // ── Pan / zoom state ──────────────────────────────────────────────────────
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, k: 1 });
  const [panDrag, setPanDrag] = useState<PanDragState | null>(null);

  // ── Node drag state ───────────────────────────────────────────────────────
  const [nodeDrag, setNodeDrag] = useState<NodeDragState | null>(null);

  // ── Position overrides (persisted) ────────────────────────────────────────
  const [overrides, setOverrides] = useState<Overrides>(
    () => readLocal(OVERRIDES_KEY, OverridesSchema) ?? {},
  );

  const svgRef = useRef<SVGSVGElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  // Live pointers (mouse / touch / pen) keyed by pointerId — drives unified
  // single-pointer pan and two-pointer pinch-zoom.
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  // Snapshot taken when a two-finger pinch begins.
  const pinchRef = useRef<
    | { startDist: number; startK: number; startX: number; startY: number; midX: number; midY: number }
    | null
  >(null);
  // Set true once a node drag actually moves, so the trailing click won't select.
  const suppressClickRef = useRef(false);

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const K_MIN = 0.5;
  const K_MAX = 2.5;

  // ── Effective positions (base + overrides) ────────────────────────────────
  const effectivePositions = useMemo(() => {
    const o: Record<string, { x: number; y: number }> = {};
    for (const [id, pos] of Object.entries(positions)) {
      const ov = overrides[id];
      o[id] = ov ? { x: pos.x + ov.dx, y: pos.y + ov.dy } : pos;
    }
    return o;
  }, [positions, overrides]);

  // ── Save overrides helper ─────────────────────────────────────────────────
  const saveOverrides = (next: Overrides) => {
    setOverrides(next);
    writeLocal(OVERRIDES_KEY, next, OverridesSchema);
  };

  // ── Zoom helpers ──────────────────────────────────────────────────────────
  // .tree-inner is left:50% margin-left:-600 width:1200 transform-origin:center-top,
  // so its base-left + origin collapse to canvasWidth/2 (cx0). For a canvas-local
  // point: screenX = cx0 + x + k*(localX-600), screenY = y + k*localY — and the
  // -600/origin constants cancel in the zoom-to-point solve below, leaving:
  //   x' = (sx-cx0) - ((sx-cx0)-x)*f,  y' = sy - (sy-y)*f   (f = newK/oldK)
  // zoomAt keeps the point (sx, sy) pinned on screen while scaling by `factor`.
  const zoomAt = (factor: number, sx: number, sy: number) => {
    setTransform(t => {
      const k = clamp(t.k * factor, K_MIN, K_MAX);
      const f = k / t.k;
      const cx0 = (canvasRef.current?.clientWidth ?? 0) / 2;
      return {
        k,
        x: (sx - cx0) - ((sx - cx0) - t.x) * f,
        y: sy - (sy - t.y) * f,
      };
    });
  };

  const zoomCenter = (factor: number) => {
    const el = canvasRef.current;
    zoomAt(factor, (el?.clientWidth ?? 0) / 2, (el?.clientHeight ?? 0) / 2);
  };

  // ── Wheel / trackpad zoom, anchored at the cursor ─────────────────────────
  // MUST be a native non-passive listener: React 18 registers onWheel as passive,
  // so e.preventDefault() inside a React onWheel handler is a no-op — the whole
  // page would zoom on ctrl/trackpad-pinch (which arrives as wheel + ctrlKey).
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      const factor = Math.exp(-e.deltaY * 0.0015);
      setTransform(t => {
        const k = clamp(t.k * factor, K_MIN, K_MAX);
        const f = k / t.k;
        const cx0 = el.clientWidth / 2;
        return { k, x: (sx - cx0) - ((sx - cx0) - t.x) * f, y: sy - (sy - t.y) * f };
      });
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Pointer events: one code path for mouse, touch, and pen ───────────────
  const beginPinch = () => {
    const pts = [...pointersRef.current.values()];
    if (pts.length < 2) return;
    const r = canvasRef.current?.getBoundingClientRect();
    pinchRef.current = {
      startDist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
      startK: transform.k,
      startX: transform.x,
      startY: transform.y,
      midX: (pts[0].x + pts[1].x) / 2 - (r?.left ?? 0),
      midY: (pts[0].y + pts[1].y) / 2 - (r?.top ?? 0),
    };
    // A pinch supersedes any in-flight single-finger pan / node drag.
    setPanDrag(null);
    setNodeDrag(null);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    // Always track the pointer first so a two-finger pinch counts correctly even
    // when one finger lands on a control; controls still own their own click.
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const onControl = !!(target.closest('.zoom-controls') || target.closest('.upstream-btn'));

    if (pointersRef.current.size >= 2) {
      beginPinch();
      return;
    }
    if (onControl) return;

    suppressClickRef.current = false;
    // Single pointer: drag a node if we pressed on one, else pan the canvas.
    const nodeEl = target.closest('[data-person]') as HTMLElement | null;
    if (nodeEl) {
      const id = nodeEl.getAttribute('data-person')!;
      setNodeDrag({
        id,
        mouseX: e.clientX,
        mouseY: e.clientY,
        startDx: overrides[id]?.dx ?? 0,
        startDy: overrides[id]?.dy ?? 0,
        moved: false,
      });
    } else {
      setPanDrag({ x: e.clientX - transform.x, y: e.clientY - transform.y });
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    // Pinch-zoom (two pointers) — anchored at the original pinch midpoint.
    const pinch = pinchRef.current;
    if (pinch && pointersRef.current.size >= 2) {
      const pts = [...pointersRef.current.values()];
      const r = canvasRef.current?.getBoundingClientRect();
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const midX = (pts[0].x + pts[1].x) / 2 - (r?.left ?? 0);
      const midY = (pts[0].y + pts[1].y) / 2 - (r?.top ?? 0);
      const k = clamp(pinch.startK * (dist / pinch.startDist), K_MIN, K_MAX);
      const cx0 = (canvasRef.current?.clientWidth ?? 0) / 2;
      const worldX = (pinch.midX - cx0 - pinch.startX) / pinch.startK;
      const worldY = (pinch.midY - pinch.startY) / pinch.startK;
      setTransform({ k, x: midX - cx0 - worldX * k, y: midY - worldY * k });
      return;
    }

    // Node drag
    if (nodeDrag) {
      const dx = (e.clientX - nodeDrag.mouseX) / transform.k;
      const dy = (e.clientY - nodeDrag.mouseY) / transform.k;
      // Threshold in SCREEN px so the dead-zone feels identical at any zoom level.
      const moved =
        nodeDrag.moved ||
        Math.hypot(e.clientX - nodeDrag.mouseX, e.clientY - nodeDrag.mouseY) > 3;
      if (moved) {
        suppressClickRef.current = true;
        setNodeDrag({ ...nodeDrag, moved: true });
        setOverrides(prev => ({
          ...prev,
          [nodeDrag.id]: { dx: nodeDrag.startDx + dx, dy: nodeDrag.startDy + dy },
        }));
      }
      return;
    }

    // Pan
    if (panDrag) {
      setTransform(t => ({ ...t, x: e.clientX - panDrag.x, y: e.clientY - panDrag.y }));
    }
  };

  const endPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(e.pointerId);

    if (pointersRef.current.size >= 1) {
      // Dropped from a two-finger pinch to one finger: end the pinch but hand the
      // surviving finger straight to pan, so the user isn't stranded until re-press.
      if (pinchRef.current) {
        pinchRef.current = null;
        const [pt] = [...pointersRef.current.values()];
        if (pt) setPanDrag({ x: pt.x - transform.x, y: pt.y - transform.y });
      }
      return;
    }

    // Last pointer up — settle everything.
    pinchRef.current = null;
    if (nodeDrag) {
      if (nodeDrag.moved) {
        // Persist final overrides after React commits.
        setOverrides(cur => {
          writeLocal(OVERRIDES_KEY, cur, OverridesSchema);
          return cur;
        });
      }
      setNodeDrag(null);
    }
    setPanDrag(null);
    // Self-heal the click guard: a trailing click (if the pointer ended on a node)
    // fires synchronously right after pointerup and is still suppressed; clearing it
    // on the next macrotask keeps a later keyboard/click activation from being eaten.
    if (suppressClickRef.current) {
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
  };

  // Select on tap/click/keyboard — unless the press turned into a node drag.
  const activateNode = (id: string) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onSelect(id);
  };

  // ── Keyboard: arrows pan, +/− zoom, 0 resets (canvas must be focused) ──────
  const PAN_STEP = 64;
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case 'ArrowUp': e.preventDefault(); setTransform(t => ({ ...t, y: t.y + PAN_STEP })); break;
      case 'ArrowDown': e.preventDefault(); setTransform(t => ({ ...t, y: t.y - PAN_STEP })); break;
      case 'ArrowLeft': e.preventDefault(); setTransform(t => ({ ...t, x: t.x + PAN_STEP })); break;
      case 'ArrowRight': e.preventDefault(); setTransform(t => ({ ...t, x: t.x - PAN_STEP })); break;
      case '+': case '=': e.preventDefault(); zoomCenter(1.2); break;
      case '-': case '_': e.preventDefault(); zoomCenter(1 / 1.2); break;
      case '0': e.preventDefault(); setTransform({ x: 0, y: 0, k: 1 }); break;
    }
  };

  // ── Build edges from effective positions (memoized — was rebuilt every render) ──
  const { edges, coupleLinks } = useMemo(() => {
    const edges: Array<{ from: { x: number; y: number }; to: { x: number; y: number }; key: string }> = [];
    const coupleLinks: Array<{ a: { x: number; y: number }; b: { x: number; y: number }; key: string }> = [];

    for (const p of data.people) {
      // Parent-child edges
      if (p.parents && p.parents.length) {
        const pr = p.parents
          .map(pid => effectivePositions[pid])
          .filter((pos): pos is { x: number; y: number } => pos != null);
        if (pr.length && effectivePositions[p.id]) {
          const midX = pr.reduce((s, pp) => s + pp.x, 0) / pr.length;
          const midY = pr.reduce((s, pp) => s + pp.y, 0) / pr.length + 40;
          edges.push({ from: { x: midX, y: midY }, to: effectivePositions[p.id]!, key: `e-${p.id}` });
        }
      }
      // Spouse links
      if (p.spouseOf && effectivePositions[p.id] && effectivePositions[p.spouseOf]) {
        coupleLinks.push({ a: effectivePositions[p.id]!, b: effectivePositions[p.spouseOf]!, key: `c-${p.id}` });
      }
    }

    return { edges, coupleLinks };
  }, [data.people, effectivePositions]);

  // ── Highlight path set ────────────────────────────────────────────────────
  const pathIds = new Set<string>(highlightPath ?? []);

  // ── POV: active view or tree owner ────────────────────────────────────────
  const pov = activeViewId ?? data.people.find(pp => pp.isMe)?.id;

  // ── Label computation ─────────────────────────────────────────────────────
  const getLabel = (personId: string, personNick: string | undefined): string => {
    if (labelMode === 'relation' && activeViewId) {
      if (personId === activeViewId) return personNick ?? '';
      return (
        computeRelation(data.people, activeViewId, personId) ??
        personNick ??
        ''
      );
    }
    return personNick ?? '';
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="tree-canvas"
      data-testid="tree-canvas"
      ref={canvasRef}
      tabIndex={0}
      role="application"
      aria-roledescription="แผนผังครอบครัวแบบโต้ตอบ"
      aria-label="แผนผังครอบครัว — เมื่อโฟกัสแล้ว ใช้ปุ่มลูกศรเลื่อนมุมมอง, ปุ่ม + และ − เพื่อซูม, ปุ่ม 0 เพื่อรีเซ็ต"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onPointerLeave={endPointer}
      onKeyDown={onKeyDown}
      style={{ cursor: panDrag ? 'grabbing' : 'grab' }}
    >
      {/* Background paper texture */}
      <div className="paper-bg" />
      <div className="paper-vignette" />

      <div
        className="tree-inner"
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`,
        }}
      >
        {/* ── SVG edges layer ── */}
        <svg
          ref={svgRef}
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          style={{ overflow: 'visible' }}
        >
          {/* Parent-child branch curves */}
          {edges.map(e => {
            const isHot = pathIds.has(e.key);
            return (
              <path
                key={e.key}
                d={branchPath(e.from.x, e.from.y, e.to.x, e.to.y)}
                stroke={isHot ? 'var(--blossom)' : 'var(--bark)'}
                strokeWidth={isHot ? 4 : 2.5}
                fill="none"
                opacity={isHot ? 1 : 0.55}
                strokeLinecap="round"
              />
            );
          })}

          {/* Lineage edges (dashed, muted) */}
          {lineageEdges.map(e => (
            <path
              key={e.key}
              d={branchPath(e.from.x, e.from.y, e.to.x, e.to.y)}
              stroke="var(--leaf)"
              strokeWidth="2"
              fill="none"
              opacity="0.55"
              strokeLinecap="round"
              strokeDasharray="5 4"
            />
          ))}

          {/* Lineage spouse links */}
          {lineageSpouse.map(c => (
            <line
              key={c.key}
              x1={c.a.x}
              y1={c.a.y}
              x2={c.b.x}
              y2={c.b.y}
              stroke="var(--blossom)"
              strokeWidth="1.2"
              opacity="0.5"
              strokeDasharray="3 3"
            />
          ))}

          {/* Spouse links (dashed with center dot) */}
          {coupleLinks.map(c => (
            <g key={c.key}>
              <line
                x1={c.a.x}
                y1={c.a.y}
                x2={c.b.x}
                y2={c.b.y}
                stroke="var(--blossom)"
                strokeWidth="1.5"
                opacity="0.6"
                strokeDasharray="4 3"
              />
              <circle
                cx={(c.a.x + c.b.x) / 2}
                cy={(c.a.y + c.b.y) / 2}
                r="3"
                fill="var(--blossom)"
              />
            </g>
          ))}

          {/* Tiny leaf decorations at edge midpoints */}
          {edges.map((e, i) => {
            const mx = (e.from.x + e.to.x) / 2;
            const my = (e.from.y + e.to.y) / 2;
            const rot = (i * 37) % 360;
            return (
              <g
                key={`leaf-${i}`}
                transform={`translate(${mx - 16}, ${my}) rotate(${rot})`}
                opacity="0.32"
              >
                <path d="M 0 0 Q 5 -3 10 0 Q 5 3 0 0 Z" fill="var(--leaf)" />
              </g>
            );
          })}
        </svg>

        {/* ── Main tree nodes ── */}
        {data.people.map(p => {
          const pos = effectivePositions[p.id];
          if (!pos) return null;

          const isSelected = selectedId === p.id;
          const isPOV = p.id === pov;
          const isHighlighted = pathIds.has(p.id);
          const isDragging =
            nodeDrag !== null &&
            nodeDrag.id === p.id &&
            nodeDrag.moved;

          const label = getLabel(p.id, p.nick);

          return (
            <PersonNode
              key={p.id}
              person={p}
              position={pos}
              isSelected={isSelected}
              isPOV={isPOV}
              isHighlighted={isHighlighted}
              activeViewIsSet={activeViewId !== null}
              label={label}
              dragging={isDragging}
              expanded={expandedLineages.has(p.id)}
              onActivate={() => activateNode(p.id)}
              onToggleUpstream={(e: React.MouseEvent<HTMLButtonElement>) => {
                e.stopPropagation();
                onToggleLineage(p.id);
              }}
            />
          );
        })}

        {/* ── Expanded lineage ancestor nodes ── */}
        {lineageNodes.map(n => {
          const pos =
            effectivePositions[n.renderId] ?? positions[n.renderId];
          if (!pos) return null;

          const isDragging =
            nodeDrag !== null &&
            nodeDrag.id === n.renderId &&
            nodeDrag.moved;

          const bridgeNick = idToPerson[n.bridgeId]?.nick ?? '';

          return (
            <LineageNode
              key={n.renderId}
              node={n}
              position={pos}
              bridgeNick={bridgeNick}
              dragging={isDragging}
            />
          );
        })}
      </div>

      {/* ── Zoom controls (bottom-right) ── */}
      <div className="zoom-controls">
        <button type="button" aria-label="ซูมเข้า" onClick={() => zoomCenter(1.2)}>
          +
        </button>
        <button type="button" aria-label="ซูมออก" onClick={() => zoomCenter(1 / 1.2)}>
          −
        </button>
        <button
          type="button"
          aria-label="รีเซ็ตมุมมอง"
          title="รีเซ็ตมุมมอง"
          onClick={() => setTransform({ x: 0, y: 0, k: 1 })}
        >
          ⟲
        </button>
        {Object.keys(overrides).length > 0 && (
          <button
            type="button"
            aria-label="รีเซ็ตตำแหน่งโหนด"
            onClick={() => saveOverrides({})}
            title="รีเซ็ตตำแหน่งโหนด"
            style={{ fontSize: 11, padding: '6px 8px', lineHeight: 1 }}
          >
            รีเซ็ต
          </button>
        )}
      </div>
    </div>
  );
}
