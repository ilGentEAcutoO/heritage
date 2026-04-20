/**
 * useTweaks — localStorage-backed theme/nodeShape/showTrunk settings.
 * Syncs theme classes to document.body.
 */

import { useState, useEffect } from 'react';
import { z } from 'zod';
import { readLocal, writeLocal } from '@app/lib/storage';

const STORAGE_KEY = 'heritage-tweaks';

export interface Tweaks {
  theme: 'paper' | 'forest' | 'blueprint';
  nodeShape: 'circle' | 'polaroid' | 'square';
  showTrunk: boolean;
}

export const TweaksSchema = z
  .object({
    theme: z.enum(['paper', 'forest', 'blueprint']),
    nodeShape: z.enum(['circle', 'polaroid', 'square']),
    showTrunk: z.boolean(),
  })
  .strict();

const DEFAULTS: Tweaks = {
  theme: 'paper',
  nodeShape: 'circle',
  showTrunk: true,
};

export function loadFromStorage(): Tweaks {
  return readLocal(STORAGE_KEY, TweaksSchema) ?? DEFAULTS;
}

export function loadFromWindowDefaults(): Tweaks | null {
  try {
    const win = window as unknown as { TWEAK_DEFAULTS?: unknown };
    if (!win.TWEAK_DEFAULTS) return null;
    const result = TweaksSchema.safeParse(win.TWEAK_DEFAULTS);
    if (!result.success) return null;
    return result.data;
  } catch {
    return null;
  }
}

function applyThemeToBody(tweaks: Tweaks) {
  document.body.className = '';
  if (tweaks.theme === 'forest') document.body.classList.add('theme-forest');
  if (tweaks.theme === 'blueprint') document.body.classList.add('theme-blueprint');
  if (tweaks.nodeShape === 'polaroid') document.body.classList.add('shape-polaroid');
  if (tweaks.nodeShape === 'square') document.body.classList.add('shape-square');
}

interface UseTweaksResult {
  tweaks: Tweaks;
  updateTweak: <K extends keyof Tweaks>(key: K, value: Tweaks[K]) => void;
  setTweaks: (t: Tweaks) => void;
}

export function useTweaks(): UseTweaksResult {
  const [tweaks, setTweaksState] = useState<Tweaks>(() => {
    // Server-side guard (should not happen in Vite/browser context)
    if (typeof window === 'undefined') return DEFAULTS;
    // Prefer window.TWEAK_DEFAULTS injected by host page, validated via Zod
    const fromWindow = loadFromWindowDefaults();
    if (fromWindow) return fromWindow;
    return loadFromStorage();
  });

  // Apply theme classes whenever tweaks change
  useEffect(() => {
    applyThemeToBody(tweaks);
    writeLocal(STORAGE_KEY, tweaks, TweaksSchema);
  }, [tweaks]);

  const setTweaks = (t: Tweaks) => setTweaksState(t);

  const updateTweak = <K extends keyof Tweaks>(key: K, value: Tweaks[K]) => {
    setTweaksState((prev) => ({ ...prev, [key]: value }));
  };

  return { tweaks, updateTweak, setTweaks };
}
