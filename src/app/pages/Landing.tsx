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
        gap: '1.4rem',
        fontFamily: '"Prompt", system-ui, sans-serif',
        background:
          'radial-gradient(80% 60% at 50% 0%, #ffffff 0%, var(--bg, #eef0f4) 70%)',
        color: 'var(--ink, #1e2430)',
      }}
    >
      {/* Logo mark in a soft floating badge */}
      <div
        style={{
          width: 96,
          height: 96,
          borderRadius: '28px',
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: 'var(--shadow, 0 8px 24px rgba(20,28,46,.1))',
          border: '1px solid var(--line, #e8eaef)',
        }}
      >
        <svg viewBox="0 0 56 56" width={48} height={48} aria-hidden="true" style={{ display: 'block' }}>
          <path
            d="M28 52 Q28 36 16 28 Q8 24 12 16 Q20 12 28 20 Q36 12 44 16 Q48 24 40 28 Q28 36 28 52"
            fill="var(--leaf, #12b886)"
            opacity={0.45}
          />
          <circle cx="28" cy="20" r="6" fill="var(--blossom, #ff7a59)" />
          <path d="M28 26 L28 52" stroke="var(--bark, #cbd1db)" strokeWidth={3} />
        </svg>
      </div>

      {/* Title */}
      <h1
        style={{
          fontFamily: '"Prompt", system-ui, sans-serif',
          fontSize: '2.7rem',
          fontWeight: 600,
          margin: 0,
          letterSpacing: '-0.02em',
          lineHeight: 1.1,
        }}
      >
        Heritage
      </h1>

      {/* Tagline */}
      <p
        style={{
          fontSize: '1.05rem',
          margin: 0,
          color: 'var(--ink-soft, #5d6675)',
          textAlign: 'center',
        }}
      >
        เก็บเรื่องราวของครอบครัวคุณ
      </p>

      {/* CTAs — logged-in users only */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1rem',
          marginTop: '0.5rem',
        }}
      >
        {!loading && user && (
          <Link
            to="/trees"
            style={{
              padding: '0.75rem 1.8rem',
              borderRadius: '999px',
              background: 'var(--accent-grad, linear-gradient(135deg,#20c997,#0ca678))',
              color: '#fff',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: '0.98rem',
              boxShadow: '0 6px 18px rgba(12,166,120,.32)',
              transition: 'filter 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.filter = 'brightness(1.04)';
              e.currentTarget.style.boxShadow = '0 8px 22px rgba(12,166,120,.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.filter = 'brightness(1)';
              e.currentTarget.style.boxShadow = '0 6px 18px rgba(12,166,120,.32)';
            }}
          >
            ดูต้นไม้ของฉัน →
          </Link>
        )}

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
              color: 'var(--ink-faint, #98a1b0)',
              fontSize: '0.85rem',
              opacity: loggingOut ? 0.4 : 1,
              padding: 0,
              fontFamily: '"Prompt", system-ui, sans-serif',
            }}
          >
            {loggingOut ? 'กำลังออก…' : 'ออกจากระบบ'}
          </button>
        )}
      </div>
    </div>
  );
}
