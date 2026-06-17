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
        background: 'var(--bg, #faf8f4)',
        color: 'var(--ink, #2a1f14)',
        gap: '1rem',
      }}
    >
      <h1
        style={{
          fontFamily: '"Prompt", system-ui, sans-serif',
          fontSize: '4rem',
          margin: 0,
          opacity: 0.25,
        }}
      >
        404
      </h1>
      <p style={{ margin: 0, opacity: 0.6 }}>ไม่พบหน้านี้</p>
      <Link
        to="/"
        style={{ color: 'var(--leaf, #6b8f5e)', textDecoration: 'underline' }}
      >
        กลับหน้าหลัก
      </Link>
    </div>
  );
}
