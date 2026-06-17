/**
 * Login.tsx — Email + password login page, with Magic link tab.
 */

import { useState, FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useSession } from '@app/hooks/useSession';
import { apiClient } from '@app/lib/api';
import type { ApiError } from '@app/lib/api';
import { AuthLogo } from '@app/components/AuthLogo';

type Tab = 'password' | 'magic';

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
    <div className="auth-screen">
      <div className="auth-card">
        <AuthLogo />

        <h1 className="auth-title">เข้าสู่ระบบ</h1>
        <p className="auth-subtitle">Heritage · เก็บเรื่องราวของครอบครัว</p>

        {/* Tab switcher */}
        <div className="auth-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === 'password'}
            className={activeTab === 'password' ? 'auth-tab active' : 'auth-tab'}
            onClick={() => handleTabSwitch('password')}
            type="button"
          >
            รหัสผ่าน (Password)
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'magic'}
            className={activeTab === 'magic' ? 'auth-tab active' : 'auth-tab'}
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
              <div className="auth-success" aria-live="polite">รีเซ็ตรหัสผ่านสำเร็จ กรุณาเข้าสู่ระบบด้วยรหัสใหม่</div>
            )}

            {errorMsg && <div className="form-error" role="alert">{errorMsg}</div>}

            <form onSubmit={handlePasswordSubmit}>
              <label className="field-label" htmlFor="login-email">อีเมล</label>
              <input
                id="login-email"
                className="field-input"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <label className="field-label" htmlFor="login-password">รหัสผ่าน</label>
              <input
                id="login-password"
                className="field-input"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              <button
                className="btn-primary full-width"
                type="submit"
                disabled={submitting}
              >
                {submitting ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
              </button>
            </form>

            <div className="auth-footer">
              <Link to="/auth/reset" className="auth-link">ลืมรหัสผ่าน?</Link>
              {' · '}
              <Link to="/signup" className="auth-link">สมัครสมาชิก</Link>
            </div>
          </>
        )}

        {/* Magic link tab */}
        {activeTab === 'magic' && (
          <>
            {magicError && <div className="form-error" role="alert">{magicError}</div>}

            {magicSent ? (
              <div className="auth-info" data-testid="magic-sent" aria-live="polite">
                ถ้ามีบัญชีกับอีเมลนี้ เราได้ส่งลิงก์เข้าสู่ระบบให้แล้ว ตรวจสอบกล่องจดหมายของคุณ
                <br />
                <small style={{ opacity: 0.75 }}>
                  If an account exists with that email, we sent a sign-in link. Check your inbox.
                </small>
              </div>
            ) : (
              <form onSubmit={handleMagicSubmit}>
                <label className="field-label" htmlFor="magic-email">อีเมล</label>
                <input
                  id="magic-email"
                  className="field-input"
                  type="email"
                  autoComplete="email"
                  required
                  value={magicEmail}
                  onChange={(e) => setMagicEmail(e.target.value)}
                  placeholder="your@email.com"
                />

                <button
                  className="btn-primary full-width"
                  type="submit"
                  disabled={magicSubmitting}
                >
                  {magicSubmitting ? 'กำลังส่ง…' : 'ส่งลิงก์เข้าสู่ระบบ (Send magic link)'}
                </button>
              </form>
            )}

            <div className="auth-footer">
              <Link to="/signup" className="auth-link">สมัครสมาชิก</Link>
              {' · '}
              <Link to="/login" className="auth-link" onClick={() => handleTabSwitch('password')}>
                ใช้รหัสผ่าน
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
