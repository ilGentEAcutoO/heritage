/**
 * palettes.ts — per-tree colour palette definitions.
 *
 * Each palette is a set of CSS custom properties that override the :root
 * defaults when applied as inline style on the .app root element.
 * This keeps palette application scoped to the subtree (no body-class war).
 *
 * Values for 'forest' and 'blueprint' are copied verbatim from
 * src/app/styles.css body.theme-forest / body.theme-blueprint rules.
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

  // Dark green / forest — matches body.theme-forest in styles.css exactly.
  forest: {
    '--paper': 'oklch(0.22 0.02 160)',
    '--paper-2': 'oklch(0.26 0.025 160)',
    '--ink': 'oklch(0.92 0.02 90)',
    '--ink-soft': 'oklch(0.75 0.03 90)',
    '--ink-faint': 'oklch(0.55 0.03 90)',
    '--bark': 'oklch(0.85 0.04 80)',
    '--leaf': 'oklch(0.75 0.1 140)',
    '--leaf-soft': 'oklch(0.5 0.08 140)',
    '--blossom': 'oklch(0.75 0.14 55)',
    '--blossom-soft': 'oklch(0.3 0.08 45)',
    '--sepia': 'oklch(0.6 0.05 80)',
    '--line': 'oklch(0.35 0.02 160)',
    '--rule': 'oklch(0.45 0.02 160)',
  } as CSSProperties,

  // Blueprint / dark blue — matches body.theme-blueprint in styles.css exactly.
  blueprint: {
    '--paper': 'oklch(0.32 0.08 250)',
    '--paper-2': 'oklch(0.36 0.08 250)',
    '--ink': 'oklch(0.95 0.02 250)',
    '--ink-soft': 'oklch(0.8 0.03 250)',
    '--ink-faint': 'oklch(0.6 0.04 250)',
    '--bark': 'oklch(0.9 0.02 250)',
    '--leaf': 'oklch(0.85 0.08 220)',
    '--leaf-soft': 'oklch(0.5 0.1 220)',
    '--blossom': 'oklch(0.9 0.1 80)',
    '--blossom-soft': 'oklch(0.45 0.08 250)',
    '--sepia': 'oklch(0.7 0.04 250)',
    '--line': 'oklch(0.48 0.06 250)',
    '--rule': 'oklch(0.6 0.06 250)',
  } as CSSProperties,

  // Rose — warm pink / blush tones, light background.
  rose: {
    '--paper': 'oklch(0.97 0.01 15)',
    '--paper-2': 'oklch(0.93 0.02 15)',
    '--ink': 'oklch(0.28 0.04 20)',
    '--ink-soft': 'oklch(0.45 0.04 20)',
    '--ink-faint': 'oklch(0.62 0.03 20)',
    '--bark': 'oklch(0.5 0.06 30)',
    '--leaf': 'oklch(0.6 0.14 355)',
    '--leaf-soft': 'oklch(0.82 0.08 355)',
    '--blossom': 'oklch(0.72 0.18 15)',
    '--blossom-soft': 'oklch(0.88 0.07 15)',
    '--sepia': 'oklch(0.55 0.06 30)',
    '--line': 'oklch(0.86 0.03 15)',
    '--rule': 'oklch(0.78 0.04 15)',
  } as CSSProperties,

  // Ocean — cool teal / cerulean tones, light background.
  ocean: {
    '--paper': 'oklch(0.96 0.015 210)',
    '--paper-2': 'oklch(0.91 0.025 210)',
    '--ink': 'oklch(0.22 0.04 220)',
    '--ink-soft': 'oklch(0.4 0.05 220)',
    '--ink-faint': 'oklch(0.58 0.04 220)',
    '--bark': 'oklch(0.45 0.07 230)',
    '--leaf': 'oklch(0.55 0.12 195)',
    '--leaf-soft': 'oklch(0.78 0.07 195)',
    '--blossom': 'oklch(0.65 0.14 250)',
    '--blossom-soft': 'oklch(0.85 0.06 250)',
    '--sepia': 'oklch(0.5 0.05 220)',
    '--line': 'oklch(0.82 0.04 210)',
    '--rule': 'oklch(0.72 0.05 210)',
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
