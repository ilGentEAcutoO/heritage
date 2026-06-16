/**
 * Signup.tsx — Email + password + optional displayName registration page.
 * Always shows "check your inbox" on submit — no email enumeration.
 */

import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { ApiError } from '@app/lib/api';
import { apiClient } from '@app/lib/api';

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
    boxShadow: 'var(--shadow)',
  },
  logo: { display: 'block', margin: '0 auto 1.25rem', textAlign: 'center' as const },
  heading: {
    fontFamily: '"Prompt", system-ui, sans-serif',
    fontSize: '1.75rem',
    fontWeight: 600,
    margin: '0 0 0.25rem',
    textAlign: 'center' as const,
    color: 'var(--ink)',
  },
  sub: {
    fontSize: '0.85rem',
    color: 'var(--ink-soft)',
    textAlign: 'center' as const,
    margin: '0 0 1.5rem',
  },
  label: {
    display: 'block',
    fontSize: '0.8rem',
    fontWeight: 600,
    marginBottom: '0.3rem',
    letterSpacing: '0.03em',
    color: 'var(--ink-soft)',
  },
  input: {
    width: '100%',
    padding: '0.6rem 0.75rem',
    border: '1px solid var(--line)',
    borderRadius: '12px',
    fontFamily: '"Prompt", system-ui, sans-serif',
    fontSize: '0.95rem',
    color: 'var(--ink)',
    background: 'var(--paper-2)',
    boxSizing: 'border-box' as const,
    marginBottom: '1rem',
  },
  hint: {
    fontSize: '0.75rem',
    color: 'var(--ink-faint)',
    marginTop: '-0.75rem',
    marginBottom: '1rem',
  },
  btn: {
    width: '100%',
    padding: '0.6rem 1.3rem',
    background: 'var(--accent-grad)',
    color: '#fff',
    border: 'none',
    borderRadius: '999px',
    fontFamily: '"Prompt", system-ui, sans-serif',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(12,166,120,.3)',
    transition: 'opacity 0.15s',
  },
  error: {
    background: '#fef2f2',
    border: '1px solid #fca5a5',
    borderRadius: '10px',
    padding: '0.65rem 0.8rem',
    fontSize: '0.875rem',
    color: '#991b1b',
    marginBottom: '1rem',
  },
  success: {
    background: 'var(--leaf-soft)',
    border: '1px solid var(--line)',
    borderRadius: '12px',
    padding: '1rem',
    fontSize: '0.95rem',
    color: 'var(--leaf-strong)',
    textAlign: 'center' as const,
    lineHeight: 1.6,
  },
  footer: {
    textAlign: 'center' as const,
    marginTop: '1.25rem',
    fontSize: '0.875rem',
    color: 'var(--ink-soft)',
  },
  link: { color: 'var(--leaf)', textDecoration: 'none' as const },
};

export function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg('');

    if (password.length < 12) {
      setErrorMsg('รหัสผ่านต้องมีอย่างน้อย 12 ตัวอักษร');
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.signup({
        email,
        password,
        ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
      });
      // Backend always 201 — don't reveal enumeration; just show check-inbox
      setDone(true);
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr.status === 422) {
        setErrorMsg('ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีเมลและรหัสผ่าน');
      } else {
        setErrorMsg('เกิดข้อผิดพลาด กรุณาลองอีกครั้ง');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
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

        <h1 style={s.heading}>สมัครสมาชิก</h1>
        <p style={s.sub}>เริ่มเก็บเรื่องราวของครอบครัวคุณ</p>

        {done ? (
          <div style={s.success}>
            <strong>ตรวจสอบกล่องจดหมายของคุณ</strong>
            <br />
            ถ้าอีเมลนี้สามารถสมัครได้ เราได้ส่งลิงก์ยืนยันไปให้แล้ว
          </div>
        ) : (
          <>
            {errorMsg && <div style={s.error}>{errorMsg}</div>}

            <form onSubmit={handleSubmit}>
              <label style={s.label} htmlFor="signup-name">ชื่อ (ไม่บังคับ)</label>
              <input
                id="signup-name"
                style={s.input}
                type="text"
                autoComplete="name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="ชื่อที่จะแสดงในระบบ"
              />

              <label style={s.label} htmlFor="signup-email">อีเมล</label>
              <input
                id="signup-email"
                style={s.input}
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <label style={s.label} htmlFor="signup-password">รหัสผ่าน</label>
              <input
                id="signup-password"
                style={s.input}
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p style={s.hint}>อย่างน้อย 12 ตัวอักษร</p>

              <button
                style={{ ...s.btn, opacity: submitting ? 0.7 : 1 }}
                type="submit"
                disabled={submitting}
              >
                {submitting ? 'กำลังสมัคร…' : 'สมัครสมาชิก'}
              </button>
            </form>
          </>
        )}

        <div style={s.footer}>
          มีบัญชีแล้ว?{' '}
          <Link to="/login" style={s.link}>เข้าสู่ระบบ</Link>
        </div>
      </div>
    </div>
  );
}
