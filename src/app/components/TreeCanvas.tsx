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

import { useState, useMemo, useRef } from 'react';
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
  nodeStyle: 'circle' | 'polaroid' | 'square';
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

  // ── Event handlers ────────────────────────────────────────────────────────

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    setTransform(t => ({
      ...t,
      k: Math.max(0.5, Math.min(2.5, t.k + delta)),
    }));
  };

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only start pan drag if not clicking on a person node
    if ((e.target as HTMLElement).closest('[data-person]')) return;
    setPanDrag({ x: e.clientX - transform.x, y: e.clientY - transform.y });
  };

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (nodeDrag) {
      const dx = (e.clientX - nodeDrag.mouseX) / transform.k;
      const dy = (e.clientY - nodeDrag.mouseY) / transform.k;
      const moved = nodeDrag.moved || Math.abs(dx) > 3 || Math.abs(dy) > 3;
      if (moved) {
        setNodeDrag({ ...nodeDrag, moved: true });
        setOverrides(prev => ({
          ...prev,
          [nodeDrag.id]: {
            dx: nodeDrag.startDx + dx,
            dy: nodeDrag.startDy + dy,
          },
        }));
      }
      return;
    }
    if (!panDrag) return;
    setTransform(t => ({
      ...t,
      x: e.clientX - panDrag.x,
      y: e.clientY - panDrag.y,
    }));
  };

  const onMouseUp = () => {
    if (nodeDrag) {
      if (nodeDrag.moved) {
        // Persist final overrides state after React commits
        setOverrides(cur => {
          writeLocal(OVERRIDES_KEY, cur, OverridesSchema);
          return cur;
        });
      }
      setNodeDrag(null);
    }
    setPanDrag(null);
  };

  const onNodeMouseDown = (e: React.MouseEvent<HTMLDivElement>, id: string) => {
    e.stopPropagation();
    setNodeDrag({
      id,
      mouseX: e.clientX,
      mouseY: e.clientY,
      startDx: overrides[id]?.dx ?? 0,
      startDy: overrides[id]?.dy ?? 0,
      moved: false,
    });
  };

  // ── Build edges from effective positions ──────────────────────────────────
  const edges: Array<{
    from: { x: number; y: number };
    to: { x: number; y: number };
    key: string;
  }> = [];

  const coupleLinks: Array<{
    a: { x: number; y: number };
    b: { x: number; y: number };
    key: string;
  }> = [];

  for (const p of data.people) {
    // Parent-child edges
    if (p.parents && p.parents.length) {
      const pr = p.parents
        .map(pid => effectivePositions[pid])
        .filter((pos): pos is { x: number; y: number } => pos != null);
      if (pr.length && effectivePositions[p.id]) {
        const midX = pr.reduce((s, pp) => s + pp.x, 0) / pr.length;
        const midY = pr.reduce((s, pp) => s + pp.y, 0) / pr.length + 40;
        edges.push({
          from: { x: midX, y: midY },
          to: effectivePositions[p.id]!,
          key: `e-${p.id}`,
        });
      }
    }
    // Spouse links
    if (
      p.spouseOf &&
      effectivePositions[p.id] &&
      effectivePositions[p.spouseOf]
    ) {
      const a = effectivePositions[p.id]!;
      const b = effectivePositions[p.spouseOf]!;
      coupleLinks.push({ a, b, key: `c-${p.id}` });
    }
  }

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
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
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
                transform={`translate(${mx - 20}, ${my}) rotate(${rot})`}
                opacity="0.7"
              >
                <path d="M 0 0 Q 6 -4 12 0 Q 6 4 0 0 Z" fill="var(--leaf)" />
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
              onMouseDown={(e: React.MouseEvent<HTMLDivElement>) =>
                onNodeMouseDown(e, p.id)
              }
              onClick={(e: React.MouseEvent<HTMLDivElement>) => {
                e.stopPropagation();
                // Suppress click if the node was dragged
                if (nodeDrag && nodeDrag.id === p.id && nodeDrag.moved) return;
                onSelect(p.id);
              }}
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
              onMouseDown={(e: React.MouseEvent<HTMLDivElement>) =>
                onNodeMouseDown(e, n.renderId)
              }
            />
          );
        })}
      </div>

      {/* ── Zoom controls (bottom-right) ── */}
      <div className="zoom-controls">
        <button
          onClick={() =>
            setTransform(t => ({ ...t, k: Math.min(2.5, t.k + 0.15) }))
          }
        >
          +
        </button>
        <button
          onClick={() =>
            setTransform(t => ({ ...t, k: Math.max(0.5, t.k - 0.15) }))
          }
        >
          −
        </button>
        <button
          onClick={() => setTransform({ x: 0, y: 0, k: 1 })}
          title="Reset view"
        >
          ⟲
        </button>
        {Object.keys(overrides).length > 0 && (
          <button
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
