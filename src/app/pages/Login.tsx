/**
 * Login.tsx — Email + password login page, with Magic link tab.
 */

import { useState, FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useSession } from '@app/hooks/useSession';
import { apiClient } from '@app/lib/api';
import type { ApiError } from '@app/lib/api';

type Tab = 'password' | 'magic';

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
  tabBar: {
    display: 'flex',
    borderBottom: '2px solid var(--line, #ddd)',
    marginBottom: '1.5rem',
  },
  tab: (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '0.55rem 0',
    background: 'none',
    border: 'none',
    borderBottom: active ? '2px solid var(--leaf, #6b8f5e)' : '2px solid transparent',
    marginBottom: '-2px',
    fontFamily: 'Sarabun, serif',
    fontSize: '0.9rem',
    fontWeight: active ? 700 : 400,
    color: active ? 'var(--leaf, #6b8f5e)' : 'var(--ink, #2a1f14)',
    cursor: 'pointer',
    transition: 'color 0.15s, border-color 0.15s',
  }),
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
  success: {
    background: '#f0fdf4',
    border: '1px solid #86efac',
    borderRadius: '5px',
    padding: '0.65rem 0.8rem',
    fontSize: '0.875rem',
    color: '#166534',
    marginBottom: '1rem',
  },
  info: {
    background: '#f0f9ff',
    border: '1px solid #7dd3fc',
    borderRadius: '5px',
    padding: '0.65rem 0.8rem',
    fontSize: '0.875rem',
    color: '#0c4a6e',
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

export function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { login } = useSession();

  // Tab state — respect ?tab=magic query param
  const initialTab: Tab = params.get('tab') === 'magic' ? 'magic' : 'password';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  // Password tab state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Magic link tab state
  const [magicEmail, setMagicEmail] = useState('');
  const [magicSubmitting, setMagicSubmitting] = useState(false);
  const [magicError, setMagicError] = useState('');
  const [magicSent, setMagicSent] = useState(false);

  const justReset = params.get('reset') === '1';

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/trees');
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr.status === 429) {
        setErrorMsg('คุณพยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองอีกครั้ง');
      } else {
        // 401, 403 — same message to avoid enumeration
        setErrorMsg('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMagicSubmit(e: FormEvent) {
    e.preventDefault();
    setMagicError('');
    setMagicSent(false);
    setMagicSubmitting(true);
    try {
      await apiClient.requestMagicLink(magicEmail);
      setMagicSent(true);
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr.status === 429) {
        setMagicError('คุณส่งคำขอบ่อยเกินไป กรุณารอสักครู่แล้วลองอีกครั้ง (Too many attempts. Try again in a minute.)');
      } else if (apiErr.status === 400) {
        setMagicError('รูปแบบอีเมลไม่ถูกต้อง กรุณาตรวจสอบและลองอีกครั้ง');
      } else {
        setMagicError('เกิดข้อผิดพลาด กรุณาลองอีกครั้ง');
      }
    } finally {
      setMagicSubmitting(false);
    }
  }

  function handleTabSwitch(tab: Tab) {
    setActiveTab(tab);
    // Reset state when switching tabs
    setErrorMsg('');
    setMagicError('');
    setMagicSent(false);
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

        <h1 style={s.heading}>เข้าสู่ระบบ</h1>
        <p style={s.sub}>Heritage · เก็บเรื่องราวของครอบครัว</p>

        {/* Tab switcher */}
        <div style={s.tabBar} role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === 'password'}
            style={s.tab(activeTab === 'password')}
            onClick={() => handleTabSwitch('password')}
            type="button"
          >
            รหัสผ่าน (Password)
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'magic'}
            style={s.tab(activeTab === 'magic')}
            onClick={() => handleTabSwitch('magic')}
            type="button"
            data-testid="magic-tab"
          >
            Magic link
          </button>
        </div>

        {/* Password tab */}
        {activeTab === 'password' && (
          <>
            {justReset && (
              <div style={s.success}>รีเซ็ตรหัสผ่านสำเร็จ กรุณาเข้าสู่ระบบด้วยรหัสใหม่</div>
            )}

            {errorMsg && <div style={s.error}>{errorMsg}</div>}

            <form onSubmit={handlePasswordSubmit}>
              <label style={s.label} htmlFor="login-email">อีเมล</label>
              <input
                id="login-email"
                style={s.input}
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <label style={s.label} htmlFor="login-password">รหัสผ่าน</label>
              <input
                id="login-password"
                style={s.input}
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              <button
                style={{ ...s.btn, opacity: submitting ? 0.7 : 1 }}
                type="submit"
                disabled={submitting}
              >
                {submitting ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
              </button>
            </form>

            <div style={s.footer}>
              <Link to="/auth/reset" style={s.link}>ลืมรหัสผ่าน?</Link>
              {' · '}
              <Link to="/signup" style={s.link}>สมัครสมาชิก</Link>
            </div>
          </>
        )}

        {/* Magic link tab */}
        {activeTab === 'magic' && (
          <>
            {magicError && <div style={s.error}>{magicError}</div>}

            {magicSent ? (
              <div style={s.info} data-testid="magic-sent">
                ถ้ามีบัญชีกับอีเมลนี้ เราได้ส่งลิงก์เข้าสู่ระบบให้แล้ว ตรวจสอบกล่องจดหมายของคุณ
                <br />
                <small style={{ opacity: 0.75 }}>
                  If an account exists with that email, we sent a sign-in link. Check your inbox.
                </small>
              </div>
            ) : (
              <form onSubmit={handleMagicSubmit}>
                <label style={s.label} htmlFor="magic-email">อีเมล</label>
                <input
                  id="magic-email"
                  style={s.input}
                  type="email"
                  autoComplete="email"
                  required
                  value={magicEmail}
                  onChange={(e) => setMagicEmail(e.target.value)}
                  placeholder="your@email.com"
                />

                <button
                  style={{ ...s.btn, opacity: magicSubmitting ? 0.7 : 1 }}
                  type="submit"
                  disabled={magicSubmitting}
                >
                  {magicSubmitting ? 'กำลังส่ง…' : 'ส่งลิงก์เข้าสู่ระบบ (Send magic link)'}
                </button>
              </form>
            )}

            <div style={s.footer}>
              <Link to="/signup" style={s.link}>สมัครสมาชิก</Link>
              {' · '}
              <Link to="/login" style={s.link} onClick={() => handleTabSwitch('password')}>
                ใช้รหัสผ่าน
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
