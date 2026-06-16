/**
 * palettes.ts — per-tree colour palette definitions.
 *
 * Each palette is a set of CSS custom properties that override the :root
 * defaults when applied as inline style on the .app root element.
 * This keeps palette application scoped to the subtree (no body-class war).
 *
 * Design: every palette keeps a LIGHT "tinted paper" base (high-lightness
 * --paper) with low-chroma, soft-pastel accents — so each theme reads like
 * tinted stationery rather than a different app. Dark inversions were removed.
 * The 'forest'/'blueprint' keys are kept (stored values + zod enum) but now
 * render as soft Sage / Sky; styles.css body.theme-* mirrors these values.
 */

import type { CSSProperties } from 'react';

export type PaletteKey = 'paper' | 'forest' | 'blueprint' | 'rose' | 'ocean';

export const PALETTE_KEYS: PaletteKey[] = [
  'paper',
  'forest',
  'blueprint',
  'rose',
  'ocean',
];

/**
 * Maps each non-default palette key to a set of CSS custom properties.
 * 'paper' resolves to {} (no override — uses :root defaults).
 */
export const PALETTES: Record<PaletteKey, CSSProperties> = {
  // Default — no overrides; :root values apply.
  paper: {},

  // Sage — soft warm green tint on a light paper base.
  forest: {
    '--paper': 'oklch(0.972 0.012 135)',
    '--paper-2': 'oklch(0.94 0.016 135)',
    '--ink': 'oklch(0.30 0.02 150)',
    '--ink-soft': 'oklch(0.46 0.025 150)',
    '--ink-faint': 'oklch(0.62 0.02 150)',
    '--bark': 'oklch(0.50 0.03 120)',
    '--leaf': 'oklch(0.62 0.07 145)',
    '--leaf-soft': 'oklch(0.85 0.045 145)',
    '--blossom': 'oklch(0.70 0.08 50)',
    '--blossom-soft': 'oklch(0.90 0.04 60)',
    '--sepia': 'oklch(0.55 0.04 110)',
    '--line': 'oklch(0.88 0.015 135)',
    '--rule': 'oklch(0.80 0.02 135)',
  } as CSSProperties,

  // Sky — soft dusty blue tint on a light paper base.
  blueprint: {
    '--paper': 'oklch(0.972 0.012 240)',
    '--paper-2': 'oklch(0.94 0.016 240)',
    '--ink': 'oklch(0.30 0.025 250)',
    '--ink-soft': 'oklch(0.46 0.03 250)',
    '--ink-faint': 'oklch(0.62 0.025 250)',
    '--bark': 'oklch(0.50 0.04 250)',
    '--leaf': 'oklch(0.60 0.08 240)',
    '--leaf-soft': 'oklch(0.85 0.05 240)',
    '--blossom': 'oklch(0.68 0.07 280)',
    '--blossom-soft': 'oklch(0.89 0.04 280)',
    '--sepia': 'oklch(0.55 0.04 250)',
    '--line': 'oklch(0.88 0.02 240)',
    '--rule': 'oklch(0.80 0.025 240)',
  } as CSSProperties,

  // Rose — soft blush pink on a light paper base.
  rose: {
    '--paper': 'oklch(0.975 0.01 20)',
    '--paper-2': 'oklch(0.945 0.016 20)',
    '--ink': 'oklch(0.30 0.03 20)',
    '--ink-soft': 'oklch(0.46 0.035 20)',
    '--ink-faint': 'oklch(0.63 0.025 20)',
    '--bark': 'oklch(0.52 0.05 25)',
    '--leaf': 'oklch(0.64 0.09 10)',
    '--leaf-soft': 'oklch(0.86 0.05 10)',
    '--blossom': 'oklch(0.70 0.085 35)',
    '--blossom-soft': 'oklch(0.90 0.045 25)',
    '--sepia': 'oklch(0.55 0.04 30)',
    '--line': 'oklch(0.89 0.02 20)',
    '--rule': 'oklch(0.81 0.025 20)',
  } as CSSProperties,

  // Ocean — soft aqua / teal on a light paper base.
  ocean: {
    '--paper': 'oklch(0.972 0.012 200)',
    '--paper-2': 'oklch(0.94 0.016 200)',
    '--ink': 'oklch(0.29 0.025 215)',
    '--ink-soft': 'oklch(0.45 0.03 215)',
    '--ink-faint': 'oklch(0.62 0.025 215)',
    '--bark': 'oklch(0.50 0.04 210)',
    '--leaf': 'oklch(0.62 0.08 200)',
    '--leaf-soft': 'oklch(0.85 0.05 200)',
    '--blossom': 'oklch(0.70 0.07 230)',
    '--blossom-soft': 'oklch(0.89 0.04 220)',
    '--sepia': 'oklch(0.54 0.04 210)',
    '--line': 'oklch(0.88 0.02 200)',
    '--rule': 'oklch(0.80 0.025 200)',
  } as CSSProperties,
};

/**
 * Returns the inline style object for the given palette key.
 * Unknown keys, null, and 'paper' all return {} (no override).
 */
export function paletteStyle(key: string | null | undefined): CSSProperties {
  if (!key || key === 'paper') return {};
  return PALETTES[key as PaletteKey] ?? {};
}
