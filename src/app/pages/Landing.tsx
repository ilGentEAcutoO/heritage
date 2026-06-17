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
          'radial-gradient(80% 60% at 50% 0%, var(--paper) 0%, var(--bg) 70%)',
        color: 'var(--ink)',
      }}
    >
      {/* Logo mark in a soft floating badge */}
      <div
        style={{
          width: 96,
          height: 96,
          borderRadius: '28px',
          background: 'var(--paper)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: 'var(--shadow)',
          border: '1px solid var(--line)',
        }}
      >
        <svg viewBox="0 0 56 56" width={48} height={48} aria-hidden="true" style={{ display: 'block' }}>
          <path
            d="M28 52 Q28 36 16 28 Q8 24 12 16 Q20 12 28 20 Q36 12 44 16 Q48 24 40 28 Q28 36 28 52"
            fill="var(--leaf)"
            opacity={0.45}
          />
          <circle cx="28" cy="20" r="6" fill="var(--blossom)" />
          <path d="M28 26 L28 52" stroke="var(--bark)" strokeWidth={3} />
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
          color: 'var(--ink-soft)',
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
          <Link to="/trees" className="btn-primary">
            ดูต้นไม้ของฉัน →
          </Link>
        )}

        {/* Logout for authenticated users */}
        {!loading && user && (
          <button
            type="button"
            data-testid="logout-button"
            className="btn-ghost"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? 'กำลังออก…' : 'ออกจากระบบ'}
          </button>
        )}
      </div>
    </div>
  );
}
