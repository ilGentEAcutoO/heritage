/**
 * ThemePicker.tsx — owner-only palette selector in the tree header.
 *
 * Renders a "ธีม" trigger button that opens a small popover listing the five
 * palette options. Clicking a swatch calls onSelect(key). Style mirrors
 * UserMenu: same header-btn trigger, same popover shadow/border pattern.
 */

import { useState, useEffect, useRef } from 'react';
import { PALETTE_KEYS } from '@app/lib/palettes';
import type { PaletteKey } from '@app/lib/palettes';

/** Swatch preview colours for each palette (background, accent). */
const SWATCH: Record<PaletteKey, { bg: string; accent: string; label: string }> = {
  paper:     { bg: '#faf8f4', accent: '#6b8f5e', label: 'Paper (default)' },
  forest:    { bg: 'oklch(0.972 0.012 135)', accent: 'oklch(0.62 0.07 145)', label: 'Sage' },
  blueprint: { bg: 'oklch(0.972 0.012 240)', accent: 'oklch(0.60 0.08 240)', label: 'Sky' },
  rose:      { bg: 'oklch(0.975 0.01 20)',   accent: 'oklch(0.64 0.09 10)',  label: 'Rose' },
  ocean:     { bg: 'oklch(0.972 0.012 200)', accent: 'oklch(0.62 0.08 200)', label: 'Ocean' },
};

export interface ThemePickerProps {
  /** Currently active palette key (from data.meta.theme or a local preview). */
  currentTheme: string | null | undefined;
  /** Called when the user selects a palette. */
  onSelect: (key: PaletteKey | null) => void;
  /** When true, selections are local preview only (non-owner) and won't be saved. */
  previewOnly?: boolean;
}

export function ThemePicker({ currentTheme, onSelect, previewOnly = false }: ThemePickerProps): JSX.Element {
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

  const active = (currentTheme ?? 'paper') as PaletteKey;

  function handleSelect(key: PaletteKey) {
    onSelect(key === 'paper' ? null : key);
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <button
        type="button"
        data-testid="theme-picker-button"
        className="header-btn"
        aria-label="ธีม"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((prev) => !prev)}
        title={previewOnly ? 'ลองธีม (พรีวิว — ไม่บันทึก)' : 'เลือกธีมสี'}
      >
        <span style={{ opacity: 0.7 }}>🎨</span>
        <span className="btn-label">ธีม</span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="เลือกธีมสี"
          className="header-menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            minWidth: 180,
            background: 'var(--paper)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 1000,
            padding: '6px 0',
            fontFamily: '"Prompt", system-ui, sans-serif',
            fontSize: 14,
          }}
        >
          {PALETTE_KEYS.map((key) => {
            const swatch = SWATCH[key];
            const isActive = active === key || (key === 'paper' && !currentTheme);
            return (
              <button
                key={key}
                type="button"
                role="option"
                aria-selected={isActive}
                data-testid={`theme-option-${key}`}
                onClick={() => handleSelect(key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 14px',
                  background: isActive ? 'var(--leaf-soft)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--ink)',
                  fontFamily: '"Prompt", system-ui, sans-serif',
                  fontSize: 14,
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {/* Colour swatch */}
                <span
                  aria-hidden="true"
                  style={{
                    display: 'inline-block',
                    width: 18,
                    height: 18,
                    borderRadius: 4,
                    background: swatch.bg,
                    border: `2px solid ${swatch.accent}`,
                    flexShrink: 0,
                  }}
                />
                {swatch.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    style={{ marginLeft: 'auto', color: 'var(--leaf)', fontSize: 12 }}
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
                borderTop: '1px solid var(--line)',
                fontSize: 11,
                lineHeight: 1.4,
                color: 'var(--ink-faint)',
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
