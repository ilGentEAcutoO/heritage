import type { Person } from '@app/lib/types';

export interface ActiveViewPillProps {
  people: Person[];
  activeViewId: string | null;
  meId: string;
  onChange: (id: string | null) => void;
}

/**
 * Active-view POV pill — ported from the `<div className="active-view-pill">` in
 * Family Tree.html (lines 205–217).
 *
 * Select lists all people with "(ฉัน)" marker for isMe.
 * The ↺ reset button appears when activeViewId ≠ meId.
 */
export function ActiveViewPill({
  people,
  activeViewId,
  meId,
  onChange,
}: ActiveViewPillProps) {
  return (
    <div className="active-view-pill">
      <div className="avp-label">มองจากมุมของ</div>
      <select
        value={activeViewId || ''}
        onChange={e => onChange(e.target.value || null)}
      >
        <option value="">— แสดงชื่อจริง —</option>
        {people.map(p => (
          <option key={p.id} value={p.id}>
            {p.nick}
            {p.isMe ? ' (ฉัน)' : ''}
          </option>
        ))}
      </select>
      {activeViewId !== meId && (
        <button
          className="avp-clear"
          onClick={() => onChange(meId)}
          title="กลับไปมุมของฉัน"
        >
          ↺
        </button>
      )}
    </div>
  );
}
