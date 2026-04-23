/**
 * Verify.tsx — Email verification page.
 * Reads ?token= from URL, auto-POSTs on mount, shows loading/success/fail.
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
  success: {
    background: '#f0fdf4',
    border: '1px solid #86efac',
    borderRadius: '5px',
    padding: '0.75rem',
    fontSize: '0.875rem',
    color: '#166534',
    marginBottom: '1rem',
  },
  link: { color: 'var(--leaf, #6b8f5e)', textDecoration: 'none' as const },
};

type Status = 'loading' | 'success' | 'error' | 'missing';

export function Verify() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token');

  const [status, setStatus] = useState<Status>(token ? 'loading' : 'missing');

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    apiClient
      .verify(token)
      .then(() => {
        if (cancelled) return;
        setStatus('success');
        // Give user a moment to read the success message, then navigate
        setTimeout(() => {
          if (!cancelled) navigate('/trees');
        }, 1800);
      })
      .catch((err: ApiError) => {
        if (cancelled) return;
        void err;
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [token, navigate]);

  return (
    <div style={s.page}>
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
            <div style={s.error}>
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
            <div style={s.error}>ไม่พบ token สำหรับยืนยันในลิงก์นี้</div>
            <p style={s.body}>
              <Link to="/login" style={s.link}>กลับไปหน้าเข้าสู่ระบบ</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
