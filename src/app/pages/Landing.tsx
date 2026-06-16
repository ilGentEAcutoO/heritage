/**
 * Landing.tsx — Logged-in home splash.
 * Logo, tagline, and CTAs for authenticated users only.
 * Guests are served by Home.tsx instead.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '@app/hooks/useSession';

export function Landing() {
  const { user, loading, logout } = useSession();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
    } catch {
      // Best-effort — even on error the local session cache is cleared
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        gap: '1.5rem',
        fontFamily: 'Sarabun, serif',
        background: 'var(--bg, #faf8f4)',
        color: 'var(--ink, #2a1f14)',
      }}
    >
      {/* Logo mark */}
      <svg
        viewBox="0 0 56 56"
        width={56}
        height={56}
        aria-hidden="true"
        style={{ display: 'block' }}
      >
        <path
          d="M28 52 Q28 36 16 28 Q8 24 12 16 Q20 12 28 20 Q36 12 44 16 Q48 24 40 28 Q28 36 28 52"
          fill="var(--leaf, #6b8f5e)"
          opacity={0.4}
        />
        <circle cx="28" cy="20" r="6" fill="var(--blossom, #c4855a)" />
        <path
          d="M28 26 L28 52"
          stroke="var(--bark, #5c3d1e)"
          strokeWidth={3}
        />
      </svg>

      {/* Title */}
      <h1
        style={{
          fontFamily: 'Cormorant Garamond, serif',
          fontSize: '2.5rem',
          fontWeight: 600,
          margin: 0,
          letterSpacing: '0.01em',
        }}
      >
        Heritage
      </h1>

      {/* Tagline */}
      <p
        style={{
          fontSize: '1.1rem',
          margin: 0,
          opacity: 0.7,
          textAlign: 'center',
        }}
      >
        Heritage · เก็บเรื่องราวของครอบครัว
      </p>

      {/* CTAs — logged-in users only */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.85rem',
          marginTop: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          {/* Primary CTA: navigate to My Trees */}
          {!loading && user && (
            <Link
              to="/trees"
              style={{
                padding: '0.65rem 1.5rem',
                borderRadius: '6px',
                background: 'var(--leaf, #6b8f5e)',
                color: '#fff',
                textDecoration: 'none',
                fontWeight: 500,
                fontSize: '0.95rem',
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            >
              ดูต้นไม้ของฉัน
            </Link>
          )}
        </div>

        {/* Logout for authenticated users */}
        {!loading && user && (
          <button
            type="button"
            data-testid="logout-button"
            onClick={handleLogout}
            disabled={loggingOut}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: loggingOut ? 'wait' : 'pointer',
              color: 'var(--leaf, #6b8f5e)',
              textDecoration: 'none',
              fontSize: '0.85rem',
              opacity: loggingOut ? 0.4 : 0.75,
              padding: 0,
              fontFamily: 'Sarabun, serif',
            }}
          >
            {loggingOut ? 'กำลังออก…' : 'ออกจากระบบ'}
          </button>
        )}
      </div>
    </div>
  );
}
