import { useMemo } from 'react';
import type { Person, TreeData } from '@app/lib/types';
import { computeRelation, findPath } from '@app/lib/kinship';

export interface PathFinderProps {
  data: TreeData;
  meId: string;
  targetId: string | null;
  onTarget: (id: string) => void;
  onClose: () => void;
}

/**
 * Strip trailing nick from a computeRelation result so PathFinder can render
 * the nick separately. e.g. "ปู่สมชาย" → "ปู่" (PathFinder renders "สมชาย" as the name chip).
 *
 * Ported from `describeRelation` in panels.jsx.
 */
function describeRelation(people: Person[], path: string[]): string | null {
  if (!path || path.length < 2) return null;
  const meId = path[0];
  const targetId = path[path.length - 1];
  const target = people.find(p => p.id === targetId);
  if (!target) return null;

  const full = computeRelation(people, meId, targetId);
  if (!full) return 'ญาติ';

  // Strip trailing nick so PathFinder renders nick separately
  const targetNick = target.nick || '';
  if (targetNick && full.endsWith(targetNick)) {
    return full.slice(0, -targetNick.length).trim() || full;
  }
  return full;
}

/**
 * "How are we related?" panel — ported from `function PathFinder(...)` in panels.jsx.
 * Uses `findPath` and local `describeRelation` helper.
 */
export function PathFinder({
  data,
  meId,
  targetId,
  onTarget,
  onClose,
}: PathFinderProps) {
  const path = useMemo(
    () => (targetId ? findPath(data.people, meId, targetId) : null),
    [data, meId, targetId],
  );

  const me = data.people.find(p => p.id === meId);
  const target = targetId
    ? data.people.find(p => p.id === targetId) ?? null
    : null;
  const relLabel = path ? describeRelation(data.people, path) : null;

  return (
    <div className="pathfinder">
      <div className="pf-title">
        <span>เราเกี่ยวข้องกันยังไง?</span>
        <button className="pf-close" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="pf-picker">
        <div className="pf-from">
          <div className="pf-chip me-chip">
            <span className="me-dot" />
            {me?.nick}
          </div>
        </div>
        <div className="pf-arrow">→</div>
        <select
          className="pf-select"
          value={targetId || ''}
          onChange={e => onTarget(e.target.value)}
        >
          <option value="">เลือกคน…</option>
          {data.people
            .filter(p => p.id !== meId)
            .map(p => (
              <option key={p.id} value={p.id}>
                {p.nick} ({p.name})
              </option>
            ))}
        </select>
      </div>

      {target && relLabel && path && (
        <div className="pf-result">
          <div className="pf-relation">
            {target.nick} คือ <strong>{relLabel}</strong> ของคุณ
          </div>
          <div className="pf-hops">
            ผ่าน {path.length - 1} ชั้นความสัมพันธ์ ·{' '}
            <span className="pf-hint">ดูเส้นสีส้มบน tree</span>
          </div>
        </div>
      )}

      {target && !path && (
        <div className="pf-result">
          หาเส้นทางไม่เจอ — อาจต้อง merge trees ก่อน
        </div>
      )}
    </div>
  );
}
