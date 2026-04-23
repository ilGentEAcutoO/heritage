/**
 * ResetPassword.tsx — Confirm new password via reset token.
 * Reads ?token= from URL. On success, redirects to /login?reset=1.
 */

import { useState, FormEvent } from 'react';
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
    boxShadow: '0 4px 20px rgba(42,31,20,0.07)',
  },
  logo: { display: 'block', margin: '0 auto 1.25rem', textAlign: 'center' as const },
  heading: {
    fontFamily: 'Cormorant Garamond, serif',
    fontSize: '1.75rem',
    fontWeight: 600,
    margin: '0 0 0.25rem',
    textAlign: 'center' as const,
  },
  sub: {
    fontSize: '0.85rem',
    opacity: 0.6,
    textAlign: 'center' as const,
    margin: '0 0 1.5rem',
  },
  label: {
    display: 'block',
    fontSize: '0.8rem',
    fontWeight: 600,
    marginBottom: '0.3rem',
    letterSpacing: '0.03em',
  },
  input: {
    width: '100%',
    padding: '0.6rem 0.75rem',
    border: '1px solid var(--line, #ddd)',
    borderRadius: '5px',
    fontFamily: 'Sarabun, serif',
    fontSize: '0.95rem',
    color: 'var(--ink, #2a1f14)',
    background: 'var(--bg, #faf8f4)',
    boxSizing: 'border-box' as const,
    marginBottom: '1rem',
  },
  hint: {
    fontSize: '0.75rem',
    opacity: 0.6,
    marginTop: '-0.75rem',
    marginBottom: '1rem',
  },
  btn: {
    width: '100%',
    padding: '0.7rem',
    background: 'var(--leaf, #6b8f5e)',
    color: '#fff',
    border: 'none',
    borderRadius: '5px',
    fontFamily: 'Sarabun, serif',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 0.15s',
  },
  error: {
    background: '#fef2f2',
    border: '1px solid #fca5a5',
    borderRadius: '5px',
    padding: '0.65rem 0.8rem',
    fontSize: '0.875rem',
    color: '#991b1b',
    marginBottom: '1rem',
  },
  footer: {
    textAlign: 'center' as const,
    marginTop: '1.25rem',
    fontSize: '0.875rem',
    opacity: 0.7,
  },
  link: { color: 'var(--leaf, #6b8f5e)', textDecoration: 'none' as const },
};

export function ResetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg('');

    if (newPassword.length < 12) {
      setErrorMsg('รหัสผ่านต้องมีอย่างน้อย 12 ตัวอักษร');
      return;
    }

    if (newPassword !== confirm) {
      setErrorMsg('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
      return;
    }

    if (!token) {
      setErrorMsg('ไม่พบ token สำหรับรีเซ็ต กรุณาขอลิงก์ใหม่');
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.reset({ token, newPassword });
      navigate('/login?reset=1');
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr.status === 410) {
        setErrorMsg('ลิงก์รีเซ็ตนี้หมดอายุหรือใช้ไปแล้ว กรุณาขอลิงก์ใหม่');
      } else if (apiErr.status === 422) {
        setErrorMsg('รหัสผ่านไม่ตรงตามเงื่อนไข (ต้องมีอย่างน้อย 12 ตัวอักษร)');
      } else {
        setErrorMsg('เกิดข้อผิดพลาด กรุณาลองอีกครั้ง');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div style={s.page}>
        <div style={{ ...s.card, textAlign: 'center' }}>
          <h1 style={s.heading}>ลิงก์ไม่สมบูรณ์</h1>
          <div style={s.error}>ไม่พบ token สำหรับรีเซ็ตในลิงก์นี้</div>
          <Link to="/auth/reset" style={s.link}>ขอลิงก์ใหม่</Link>
        </div>
      </div>
    );
  }

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

        <h1 style={s.heading}>ตั้งรหัสผ่านใหม่</h1>
        <p style={s.sub}>กรอกรหัสผ่านใหม่ที่ต้องการใช้</p>

        {errorMsg && <div style={s.error}>{errorMsg}</div>}

        <form onSubmit={handleSubmit}>
          <label style={s.label} htmlFor="rp-password">รหัสผ่านใหม่</label>
          <input
            id="rp-password"
            style={s.input}
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <p style={s.hint}>อย่างน้อย 12 ตัวอักษร</p>

          <label style={s.label} htmlFor="rp-confirm">ยืนยันรหัสผ่าน</label>
          <input
            id="rp-confirm"
            style={s.input}
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />

          <button
            style={{ ...s.btn, opacity: submitting ? 0.7 : 1 }}
            type="submit"
            disabled={submitting}
          >
            {submitting ? 'กำลังบันทึก…' : 'ตั้งรหัสผ่านใหม่'}
          </button>
        </form>

        <div style={s.footer}>
          <Link to="/auth/reset" style={s.link}>ขอลิงก์ใหม่</Link>
          {' · '}
          <Link to="/login" style={s.link}>เข้าสู่ระบบ</Link>
        </div>
      </div>
    </div>
  );
}
