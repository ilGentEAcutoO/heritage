/**
 * Magic.tsx — Magic-link landing page (/auth/magic?token=…).
 *
 * Mirrors Verify.tsx pattern:
 * - On mount, reads ?token= from URL
 * - Missing token → redirect to /login?tab=magic
 * - Valid token → POST /api/auth/magic/consume → on 200: navigate to /trees
 * - On 400 → show error UI with retry link
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiClient } from '@app/lib/api';
import type { ApiError } from '@app/lib/api';

const s = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
    fontFamily: 'Sarabun, serif',
    background: 'var(--bg, #faf8f4)',
    color: 'var(--ink, #2a1f14)',
  },
  card: {
    width: '100%',
    maxWidth: '400px',
    background: '#fff',
    border: '1px solid var(--line, #ddd)',
    borderRadius: '8px',
    padding: '2rem',
    textAlign: 'center' as const,
    boxShadow: '0 4px 20px rgba(42,31,20,0.07)',
  },
  logo: { margin: '0 auto 1.25rem' },
  heading: {
    fontFamily: 'Cormorant Garamond, serif',
    fontSize: '1.75rem',
    fontWeight: 600,
    margin: '0 0 1rem',
  },
  body: { fontSize: '0.95rem', lineHeight: 1.6, opacity: 0.75, margin: '0 0 1.25rem' },
  error: {
    background: '#fef2f2',
    border: '1px solid #fca5a5',
    borderRadius: '5px',
    padding: '0.75rem',
    fontSize: '0.875rem',
    color: '#991b1b',
    marginBottom: '1rem',
  },
  btn: {
    display: 'inline-block',
    padding: '0.6rem 1.25rem',
    background: 'var(--leaf, #6b8f5e)',
    color: '#fff',
    border: 'none',
    borderRadius: '5px',
    fontFamily: 'Sarabun, serif',
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
    textDecoration: 'none' as const,
    transition: 'opacity 0.15s',
  },
  link: { color: 'var(--leaf, #6b8f5e)', textDecoration: 'none' as const },
  spinner: {
    display: 'inline-block',
    width: '1.5rem',
    height: '1.5rem',
    border: '3px solid var(--line, #ddd)',
    borderTopColor: 'var(--leaf, #6b8f5e)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    margin: '0 auto 1rem',
  },
};

type Status = 'loading' | 'error';

export function Magic() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token');

  const [status, setStatus] = useState<Status>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    // No token → redirect immediately
    if (!token) {
      navigate('/login?tab=magic', { replace: true });
      return;
    }

    let cancelled = false;

    apiClient
      .consumeMagicLink(token)
      .then(() => {
        if (cancelled) return;
        // Session cookie set server-side; navigate to /trees
        navigate('/trees', { replace: true });
      })
      .catch((err: ApiError) => {
        if (cancelled) return;
        // Extract server message if present, fall back to neutral copy
        const msg =
          (err as unknown as { message?: string }).message ??
          'Link expired or already used';
        setErrorMessage(msg);
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [token, navigate]);

  return (
    <div style={s.page}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={s.card}>
        <div style={s.logo}>
          <svg viewBox="0 0 56 56" width={40} height={40} aria-hidden="true">
            <path
              d="M28 52 Q28 36 16 28 Q8 24 12 16 Q20 12 28 20 Q36 12 44 16 Q48 24 40 28 Q28 36 28 52"
              fill="var(--leaf, #6b8f5e)"
              opacity={0.4}
            />
            <circle cx="28" cy="20" r="6" fill="var(--blossom, #c4855a)" />
            <path d="M28 26 L28 52" stroke="var(--bark, #5c3d1e)" strokeWidth={3} />
          </svg>
        </div>

        {status === 'loading' && (
          <>
            <div style={s.spinner} aria-hidden="true" />
            <h1 style={s.heading}>กำลังเข้าสู่ระบบ…</h1>
            <p style={s.body}>Signing you in… กรุณารอสักครู่</p>
          </>
        )}

        {status === 'error' && (
          <>
            <h1 style={s.heading}>ลิงก์หมดอายุ</h1>
            <div style={s.error} data-testid="magic-error">
              {errorMessage || 'Link expired or already used'}
              <br />
              <small style={{ opacity: 0.8 }}>ลิงก์นี้ใช้ไปแล้วหรือหมดอายุแล้ว</small>
            </div>
            <p style={s.body}>
              <Link
                to="/login?tab=magic"
                style={s.btn}
                data-testid="magic-retry-link"
              >
                ขอลิงก์ใหม่ (Request a new link)
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
