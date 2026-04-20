/**
 * LineageNode.tsx
 * Renders the smaller, dashed-border lineage ancestor nodes.
 * These appear above their bridge person when a lineage is expanded.
 * Uses .person-node.lineage CSS class.
 */

import type { LineageNode as LineageNodeType } from '@app/lib/layout';

export interface LineageNodeProps {
  node: LineageNodeType;
  position: { x: number; y: number };
  bridgeNick: string;
  dragging: boolean;
  onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export function LineageNode({
  node,
  position,
  bridgeNick,
  dragging,
  onMouseDown,
}: LineageNodeProps) {
  return (
    <div
      key={node.renderId}
      data-person={node.renderId}
      className={[
        'person-node',
        'lineage',
        node.died ? 'passed' : '',
        dragging ? 'dragging' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ left: position.x, top: position.y, cursor: 'move' }}
      onMouseDown={onMouseDown}
      title={`ต้นสายฝั่ง ${bridgeNick}`}
    >
      <div className="node-photo lineage-photo">
        <svg viewBox="0 0 44 44" width="44" height="44">
          <circle
            cx="22"
            cy="22"
            r="20"
            fill={
              node.gender === 'f'
                ? 'oklch(0.88 0.03 40)'
                : 'oklch(0.87 0.025 200)'
            }
            stroke="var(--leaf)"
            strokeWidth="1.5"
            strokeDasharray="2 2"
          />
          <text
            x="22"
            y="27"
            textAnchor="middle"
            fontFamily="Cormorant Garamond, serif"
            fontSize="14"
            fontWeight="500"
            fill="var(--ink)"
            opacity="0.6"
          >
            {(node.nick || '').charAt(0)}
          </text>
        </svg>
      </div>
      <div className="node-label lineage-label">
        <div className="node-nick">{node.nick}</div>
        <div className="node-dates">
          {node.born}
          {node.died ? `–${node.died}` : ''}
        </div>
      </div>
    </div>
  );
}
