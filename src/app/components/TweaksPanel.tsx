export interface TweaksPanelProps {
  open: boolean;
  tweaks: {
    theme: 'paper' | 'forest' | 'blueprint';
    nodeShape: 'circle' | 'polaroid' | 'square';
    showTrunk: boolean;
  };
  onChange: (key: string, value: unknown) => void;
}

/**
 * Tweaks panel — ported from the `<div className="tweaks-panel">` in
 * Family Tree.html (lines 246–272).
 *
 * Renders theme / nodeShape / trunk toggles. Panel only renders when `open`.
 */
export function TweaksPanel({ open, tweaks, onChange }: TweaksPanelProps) {
  if (!open) return null;

  return (
    <div className="tweaks-panel">
      <h4>Tweaks</h4>

      {/* Theme */}
      <div className="tweak-row">
        <label>Theme</label>
        <div className="tweak-options">
          <button
            className={tweaks.theme === 'paper' ? 'active' : ''}
            onClick={() => onChange('theme', 'paper')}
          >
            Paper
          </button>
          <button
            className={tweaks.theme === 'forest' ? 'active' : ''}
            onClick={() => onChange('theme', 'forest')}
          >
            Forest
          </button>
          <button
            className={tweaks.theme === 'blueprint' ? 'active' : ''}
            onClick={() => onChange('theme', 'blueprint')}
          >
            Blueprint
          </button>
        </div>
      </div>

      {/* Node shape */}
      <div className="tweak-row">
        <label>Node shape</label>
        <div className="tweak-options">
          <button
            className={tweaks.nodeShape === 'circle' ? 'active' : ''}
            onClick={() => onChange('nodeShape', 'circle')}
          >
            Circle
          </button>
          <button
            className={tweaks.nodeShape === 'polaroid' ? 'active' : ''}
            onClick={() => onChange('nodeShape', 'polaroid')}
          >
            Polaroid
          </button>
          <button
            className={tweaks.nodeShape === 'square' ? 'active' : ''}
            onClick={() => onChange('nodeShape', 'square')}
          >
            Square
          </button>
        </div>
      </div>

      {/* Trunk decoration */}
      <div className="tweak-row">
        <label>Trunk decoration</label>
        <div className="tweak-options">
          <button
            className={tweaks.showTrunk ? 'active' : ''}
            onClick={() => onChange('showTrunk', true)}
          >
            On
          </button>
          <button
            className={!tweaks.showTrunk ? 'active' : ''}
            onClick={() => onChange('showTrunk', false)}
          >
            Off
          </button>
        </div>
      </div>
    </div>
  );
}
