/**
 * useTweaks — localStorage-backed theme/nodeShape/showTrunk settings.
 * Syncs theme classes to document.body.
 * Handles postMessage edit-mode protocol from prototype.
 */

import { useState, useEffect } from 'react';

const STORAGE_KEY = 'heritage-tweaks';

export interface Tweaks {
  theme: 'paper' | 'forest' | 'blueprint';
  nodeShape: 'circle' | 'polaroid' | 'square';
  showTrunk: boolean;
}

const DEFAULTS: Tweaks = {
  theme: 'paper',
  nodeShape: 'circle',
  showTrunk: true,
};

function loadFromStorage(): Tweaks {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Tweaks>;
    return {
      theme: parsed.theme ?? DEFAULTS.theme,
      nodeShape: parsed.nodeShape ?? DEFAULTS.nodeShape,
      showTrunk: parsed.showTrunk ?? DEFAULTS.showTrunk,
    };
  } catch {
    return DEFAULTS;
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
    // Prefer window.TWEAK_DEFAULTS injected by prototype HTML, then localStorage
    const win = window as unknown as { TWEAK_DEFAULTS?: Partial<Tweaks> };
    const fromWindow = win.TWEAK_DEFAULTS;
    if (fromWindow) {
      return {
        theme: fromWindow.theme ?? DEFAULTS.theme,
        nodeShape: fromWindow.nodeShape ?? DEFAULTS.nodeShape,
        showTrunk: fromWindow.showTrunk ?? DEFAULTS.showTrunk,
      };
    }
    return loadFromStorage();
  });

  // Apply theme classes whenever tweaks change
  useEffect(() => {
    applyThemeToBody(tweaks);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tweaks));
    } catch {
      // ignore storage errors
    }
  }, [tweaks]);

  // Edit-mode postMessage protocol (preserved from prototype; no-op in production)
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { type?: string; edits?: Partial<Tweaks> } | null;
      if (!d) return;
      if (d.type === '__activate_edit_mode') {
        // handled externally via tweaksOpen state in TreeView
      }
    };
    window.addEventListener('message', onMsg);
    // Announce availability to parent frame (design-tool iframe protocol)
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const setTweaks = (t: Tweaks) => setTweaksState(t);

  const updateTweak = <K extends keyof Tweaks>(key: K, value: Tweaks[K]) => {
    setTweaksState((prev) => {
      const next = { ...prev, [key]: value };
      // Notify parent frame (design-tool protocol)
      window.parent.postMessage({ type: '__edit_mode_set_keys', edits: { [key]: value } }, '*');
      return next;
    });
  };

  return { tweaks, updateTweak, setTweaks };
}
