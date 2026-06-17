/**
 * AuthLogo.tsx — the soft floating badge + leaf/blossom mark shown at the top of
 * every auth card (login, signup, verify, magic, reset). Decorative only — the
 * page heading carries the product name — so it's aria-hidden.
 *
 * The mark (emerald leaf + coral blossom on a stem) is the same one the auth
 * pages used to hand-roll inline; it now lives here in one place, drawn with
 * design tokens. The white rounded badge / border / shadow come from the
 * `.auth-logo` class in styles.css.
 */

export interface AuthLogoProps {
  /** Mark size in px (the SVG square). The badge scales with padding. Default 40. */
  size?: number;
}

export function AuthLogo({ size = 40 }: AuthLogoProps) {
  return (
    <div className="auth-logo" aria-hidden="true">
      <svg viewBox="0 0 56 56" width={size} height={size}>
        <path
          d="M28 52 Q28 36 16 28 Q8 24 12 16 Q20 12 28 20 Q36 12 44 16 Q48 24 40 28 Q28 36 28 52"
          fill="var(--leaf)"
          opacity={0.4}
        />
        <circle cx="28" cy="20" r="6" fill="var(--blossom)" />
        <path d="M28 26 L28 52" stroke="var(--leaf-strong)" strokeWidth={3} />
      </svg>
    </div>
  );
}
