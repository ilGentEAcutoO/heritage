/**
 * NodeStylePicker.tsx — owner-set node shape selector in the tree header.
 *
 * Renders a "โหนด" trigger button that opens a small popover listing the three
 * shape options. Clicking a shape calls onSelect(key). Style mirrors
 * ThemePicker: same header-btn trigger, same popover shadow/border pattern.
 */

import { useState, useEffect, useRef } from 'react';

export type NodeStyleValue = 'circle' | 'polaroid' | 'square';

const NODE_STYLE_KEYS: NodeStyleValue[] = ['circle', 'polaroid', 'square'];

/** Small inline shape preview for each node style option. */
const SHAPE_PREVIEW: Record<NodeStyleValue, { glyph: string; label: string }> = {
  circle:   { glyph: '●', label: 'Circle (default)' },
  polaroid: { glyph: '▣', label: 'Polaroid' },
  square:   { glyph: '■', label: 'Square' },
};

export interface NodeStylePickerProps {
  /** Currently active node style (from data.meta.nodeStyle, a local preview, or the user tweak). */
  currentNodeStyle: string | null | undefined;
  /** Called when the user selects a node shape. */
  onSelect: (key: NodeStyleValue | null) => void;
  /** When true, selections are local preview only (non-owner) and won't be saved. */
  previewOnly?: boolean;
}

export function NodeStylePicker({ currentNodeStyle, onSelect, previewOnly = false }: NodeStylePickerProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on click-outside
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const active = (currentNodeStyle ?? 'circle') as NodeStyleValue;

  function handleSelect(key: NodeStyleValue) {
    // Always pass the explicit shape value — never collapse 'circle' to null.
    // null stays reserved for "not set by owner" (DB default → falls back to tweak).
    // An explicit 'circle' preview forces the circle shape even when the tweak
    // would otherwise resolve to 'polaroid' or 'square'.
    onSelect(key);
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <button
        type="button"
        data-testid="node-style-picker-button"
        className="header-btn"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((prev) => !prev)}
        title={previewOnly ? 'ลองรูปโหนด (พรีวิว — ไม่บันทึก)' : 'เลือกรูปโหนด'}
      >
        <span style={{ opacity: 0.7 }}>▢</span> โหนด
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="เลือกรูปโหนด"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            minWidth: 180,
            background: 'var(--paper, #faf8f4)',
            border: '1px solid var(--line, #ddd)',
            borderRadius: 6,
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            zIndex: 1000,
            padding: '6px 0',
            fontFamily: '"Prompt", system-ui, sans-serif',
            fontSize: 14,
          }}
        >
          {NODE_STYLE_KEYS.map((key) => {
            const shape = SHAPE_PREVIEW[key];
            const isActive = active === key || (key === 'circle' && !currentNodeStyle);
            return (
              <button
                key={key}
                type="button"
                role="option"
                aria-selected={isActive}
                data-testid={`node-style-option-${key}`}
                onClick={() => handleSelect(key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 14px',
                  background: isActive ? 'var(--leaf-soft, rgba(107,143,94,0.15))' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--ink, #2a1f14)',
                  fontFamily: '"Prompt", system-ui, sans-serif',
                  fontSize: 14,
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {/* Shape preview glyph */}
                <span
                  aria-hidden="true"
                  style={{
                    display: 'inline-block',
                    width: 18,
                    height: 18,
                    lineHeight: '18px',
                    textAlign: 'center',
                    fontSize: 16,
                    color: 'var(--leaf, #6b8f5e)',
                    flexShrink: 0,
                  }}
                >
                  {shape.glyph}
                </span>
                {shape.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    style={{ marginLeft: 'auto', color: 'var(--leaf, #6b8f5e)', fontSize: 12 }}
                  >
                    ✓
                  </span>
                )}
              </button>
            );
          })}
          {previewOnly && (
            <div
              style={{
                padding: '6px 14px 2px',
                marginTop: 4,
                borderTop: '1px solid var(--line, #eee)',
                fontSize: 11,
                lineHeight: 1.4,
                color: 'var(--ink-faint, #999)',
              }}
            >
              👁 ลองดูเฉยๆ · ไม่บันทึก (เฉพาะเจ้าของ tree เปลี่ยนถาวรได้)
            </div>
          )}
        </div>
      )}
    </div>
  );
}
