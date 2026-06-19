/**
 * NotFound.tsx — 404 page
 */

import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '"Prompt", system-ui, sans-serif',
        background: 'var(--bg)',
        color: 'var(--ink)',
        gap: '1rem',
      }}
    >
      <h1
        style={{
          fontFamily: '"Prompt", system-ui, sans-serif',
          fontSize: '4rem',
          margin: 0,
          // Muted but AA-legible (large text ≥3:1); opacity-dimming dropped to 1.58:1 before.
          color: 'var(--ink-faint)',
        }}
      >
        404
      </h1>
      <p style={{ margin: 0, color: 'var(--ink-soft)' }}>ไม่พบหน้านี้</p>
      <Link
        to="/"
        style={{ color: 'var(--leaf-ink)', textDecoration: 'underline' }}
      >
        กลับหน้าหลัก
      </Link>
    </div>
  );
}
