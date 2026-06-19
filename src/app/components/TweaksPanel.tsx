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
 * Tweaks panel — viewer-local theme / nodeShape / trunk toggles.
 * Renders only when `open`. Styling lives in styles.css (.tweaks-panel).
 */
export function TweaksPanel({ open, tweaks, onChange }: TweaksPanelProps) {
  if (!open) return null;

  return (
    <div className="tweaks-panel">
      <h2>ปรับแต่ง</h2>

      {/* Theme */}
      <div className="tweak-row">
        <label id="tweak-theme-label">ธีม</label>
        <div className="tweak-options" role="group" aria-labelledby="tweak-theme-label">
          <button aria-pressed={tweaks.theme === 'paper'} className={tweaks.theme === 'paper' ? 'active' : ''} onClick={() => onChange('theme', 'paper')}>
            Paper
          </button>
          <button aria-pressed={tweaks.theme === 'forest'} className={tweaks.theme === 'forest' ? 'active' : ''} onClick={() => onChange('theme', 'forest')}>
            Sage
          </button>
          <button aria-pressed={tweaks.theme === 'blueprint'} className={tweaks.theme === 'blueprint' ? 'active' : ''} onClick={() => onChange('theme', 'blueprint')}>
            Sky
          </button>
        </div>
      </div>

      {/* Node shape */}
      <div className="tweak-row">
        <label id="tweak-shape-label">รูปโหนด</label>
        <div className="tweak-options" role="group" aria-labelledby="tweak-shape-label">
          <button aria-pressed={tweaks.nodeShape === 'circle'} className={tweaks.nodeShape === 'circle' ? 'active' : ''} onClick={() => onChange('nodeShape', 'circle')}>
            Circle
          </button>
          <button aria-pressed={tweaks.nodeShape === 'polaroid'} className={tweaks.nodeShape === 'polaroid' ? 'active' : ''} onClick={() => onChange('nodeShape', 'polaroid')}>
            Polaroid
          </button>
          <button aria-pressed={tweaks.nodeShape === 'square'} className={tweaks.nodeShape === 'square' ? 'active' : ''} onClick={() => onChange('nodeShape', 'square')}>
            Square
          </button>
        </div>
      </div>

      {/* Trunk decoration */}
      <div className="tweak-row">
        <label id="tweak-trunk-label">ลำต้น</label>
        <div className="tweak-options" role="group" aria-labelledby="tweak-trunk-label">
          <button aria-pressed={tweaks.showTrunk} className={tweaks.showTrunk ? 'active' : ''} onClick={() => onChange('showTrunk', true)}>
            เปิด
          </button>
          <button aria-pressed={!tweaks.showTrunk} className={!tweaks.showTrunk ? 'active' : ''} onClick={() => onChange('showTrunk', false)}>
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}
