/**
 * PersonNode.tsx
 * Per-node rendering extracted from tree-view.jsx.
 * Renders a single person in the family tree with photo placeholder,
 * badges, upstream lineage toggle button, and label.
 */

import type { Person } from '@app/lib/types';

export interface PersonNodeProps {
  person: Person;
  position: { x: number; y: number };
  isSelected: boolean;
  isPOV: boolean;              // is this the active-view person (activeViewId or me)
  isHighlighted: boolean;      // part of highlightPath
  activeViewIsSet: boolean;    // controls "ฉัน" vs "มุมมอง" badge text
  label: string;               // computed upstream — nick or relation label
  dragging: boolean;
  expanded: boolean;           // lineage expanded?
  onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
  onClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  onToggleUpstream: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

export function PersonNode({
  person,
  position,
  isSelected,
  isPOV,
  isHighlighted,
  activeViewIsSet,
  label,
  dragging,
  expanded,
  onMouseDown,
  onClick,
  onToggleUpstream,
}: PersonNodeProps) {
  const alive = !person.died;

  const classNames = [
    'person-node',
    isSelected ? 'selected' : '',
    isPOV ? 'is-me' : '',
    isHighlighted ? 'highlighted' : '',
    !alive ? 'passed' : '',
    person.external ? 'external' : '',
    dragging ? 'dragging' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      data-person={person.id}
      className={classNames}
      style={{
        left: position.x,
        top: position.y,
        cursor: dragging ? 'grabbing' : 'move',
      }}
      onMouseDown={onMouseDown}
      onClick={onClick}
    >
      <div className="node-photo">
        <svg viewBox="0 0 60 60" width="60" height="60">
          <defs>
            <pattern
              id={`stripe-${person.id}`}
              patternUnits="userSpaceOnUse"
              width="8"
              height="8"
              patternTransform="rotate(45)"
            >
              <rect
                width="8"
                height="8"
                fill={
                  person.gender === 'f'
                    ? 'oklch(0.86 0.04 40)'
                    : 'oklch(0.84 0.03 200)'
                }
              />
              <rect
                width="4"
                height="8"
                fill={
                  person.gender === 'f'
                    ? 'oklch(0.80 0.05 40)'
                    : 'oklch(0.78 0.04 200)'
                }
              />
            </pattern>
          </defs>
          <circle
            cx="30"
            cy="30"
            r="28"
            fill={`url(#stripe-${person.id})`}
            stroke="var(--ink)"
            strokeWidth="1.5"
          />
          <text
            x="30"
            y="36"
            textAnchor="middle"
            fontFamily="Cormorant Garamond, serif"
            fontSize="22"
            fontWeight="600"
            fill="var(--ink)"
            opacity="0.7"
          >
            {(person.name || '').charAt(0)}
          </text>
        </svg>

        {isPOV && (
          <div className="me-badge">
            {activeViewIsSet ? 'มุมมอง' : 'ฉัน'}
          </div>
        )}

        {person.external && (
          <button
            className={`upstream-btn ${expanded ? 'expanded' : ''}`}
            title={
              expanded
                ? `ซ่อนต้นสายของ ${person.nick}`
                : `เปิดต้นสายของ ${person.nick}`
            }
            onClick={onToggleUpstream}
          >
            <svg viewBox="0 0 16 16" width="16" height="16">
              {expanded ? (
                <path
                  d="M4 10 L12 10"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              ) : (
                <>
                  <path
                    d="M8 14 L8 9 M8 9 L4 6 M8 9 L12 6 M4 6 L4 3 M12 6 L12 3"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    fill="none"
                    strokeLinecap="round"
                  />
                  <circle cx="4" cy="3" r="1.5" fill="currentColor" />
                  <circle cx="12" cy="3" r="1.5" fill="currentColor" />
                </>
              )}
            </svg>
          </button>
        )}

        {!alive && <div className="passed-ring" />}
      </div>

      <div className="node-label">
        <div className="node-nick">{label}</div>
        <div className="node-dates">
          {person.born}
          {person.died ? `–${person.died}` : ''}
        </div>
      </div>
    </div>
  );
}
