/**
 * Verify.tsx — Email verification page.
 * Reads ?token= from URL, auto-POSTs on mount, shows loading/success/fail.
 */

import { useEffect, useRef, useState } from 'react';
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
    fontFamily: '"Prompt", system-ui, sans-serif',
    background: 'var(--bg)',
    color: 'var(--ink)',
  },
  card: {
    width: '100%',
    maxWidth: '400px',
    background: 'var(--paper)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--radius)',
    padding: '2rem',
    textAlign: 'center' as const,
    boxShadow: 'var(--shadow)',
  },
  logo: { margin: '0 auto 1.25rem' },
  heading: {
    fontSize: '1.75rem',
    fontWeight: 600,
    margin: '0 0 1rem',
    color: 'var(--ink)',
  },
  body: { fontSize: '0.95rem', lineHeight: 1.6, color: 'var(--ink-soft)', margin: '0 0 1.25rem' },
  error: {
    background: '#fef2f2',
    border: '1px solid #fca5a5',
    borderRadius: '10px',
    padding: '0.75rem',
    fontSize: '0.875rem',
    color: '#991b1b',
    marginBottom: '1rem',
  },
  success: {
    background: 'var(--leaf-soft)',
    border: '1px solid var(--line)',
    borderRadius: '10px',
    padding: '0.75rem',
    fontSize: '0.875rem',
    color: 'var(--leaf-strong)',
    marginBottom: '1rem',
  },
  link: { color: 'var(--leaf)', textDecoration: 'none' as const, fontWeight: 600 },
};

type Status = 'loading' | 'success' | 'error' | 'missing';

export function Verify() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token');

  const [status, setStatus] = useState<Status>(token ? 'loading' : 'missing');

  // The verify token is single-use (the server atomically consumes it). React
  // StrictMode double-invokes effects in dev, and any accidental remount would
  // re-fire the POST — the second call hits an already-consumed token (410) and
  // would clobber the success state, leaving the user stranded on this page.
  // Guard so the POST fires exactly once per token value.
  const verifiedToken = useRef<string | null>(null);

  useEffect(() => {
    if (!token) return;
    if (verifiedToken.current === token) return;
    verifiedToken.current = token;

    apiClient
      .verify(token)
      .then(() => {
        setStatus('success');
        // Give user a moment to read the success message, then navigate
        setTimeout(() => navigate('/trees'), 1800);
      })
      .catch((err: ApiError) => {
        void err;
        setStatus('error');
      });
  }, [token, navigate]);

  return (
    <div style={s.page}>
      <div style={s.card} aria-live="polite">
        <div style={s.logo}>
          <svg viewBox="0 0 56 56" width={40} height={40} aria-hidden="true">
            <path
              d="M28 52 Q28 36 16 28 Q8 24 12 16 Q20 12 28 20 Q36 12 44 16 Q48 24 40 28 Q28 36 28 52"
              fill="var(--leaf)"
              opacity={0.4}
            />
            <circle cx="28" cy="20" r="6" fill="var(--blossom)" />
            <path d="M28 26 L28 52" stroke="var(--leaf-strong)" strokeWidth={3} />
          </svg>
        </div>

        {status === 'loading' && (
          <>
            <h1 style={s.heading}>กำลังยืนยันอีเมล…</h1>
            <p style={s.body}>กรุณารอสักครู่</p>
          </>
        )}

        {status === 'success' && (
          <>
            <h1 style={s.heading}>ยืนยันอีเมลสำเร็จ!</h1>
            <div style={s.success}>บัญชีของคุณพร้อมใช้งานแล้ว กำลังพาคุณไป…</div>
          </>
        )}

        {status === 'error' && (
          <>
            <h1 style={s.heading}>ลิงก์หมดอายุ</h1>
            <div style={s.error} role="alert">
              ลิงก์ยืนยันนี้ใช้ไปแล้วหรือหมดอายุแล้ว
            </div>
            <p style={s.body}>
              <Link to="/login" style={s.link}>เข้าสู่ระบบ</Link>
              {' หรือ '}
              <Link to="/signup" style={s.link}>สมัครสมาชิกใหม่</Link>
            </p>
          </>
        )}

        {status === 'missing' && (
          <>
            <h1 style={s.heading}>ลิงก์ไม่สมบูรณ์</h1>
            <div style={s.error} role="alert">ไม่พบ token สำหรับยืนยันในลิงก์นี้</div>
            <p style={s.body}>
              <Link to="/login" style={s.link}>กลับไปหน้าเข้าสู่ระบบ</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
