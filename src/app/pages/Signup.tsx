/**
 * Signup.tsx — Email + password + optional displayName registration page.
 * Always shows "check your inbox" on submit — no email enumeration.
 */

import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { ApiError } from '@app/lib/api';
import { apiClient } from '@app/lib/api';
import { AuthLogo } from '@app/components/AuthLogo';

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
    <div className="auth-screen">
      <div className="auth-card">
        <AuthLogo />

        <h1 className="auth-title">สมัครสมาชิก</h1>
        <p className="auth-subtitle">เริ่มเก็บเรื่องราวของครอบครัวคุณ</p>

        {done ? (
          <div className="auth-success" aria-live="polite">
            <strong>ตรวจสอบกล่องจดหมายของคุณ</strong>
            <br />
            ถ้าอีเมลนี้สามารถสมัครได้ เราได้ส่งลิงก์ยืนยันไปให้แล้ว
          </div>
        ) : (
          <>
            {errorMsg && <div className="form-error" role="alert">{errorMsg}</div>}

            <form onSubmit={handleSubmit}>
              <label className="field-label" htmlFor="signup-name">ชื่อ (ไม่บังคับ)</label>
              <input
                id="signup-name"
                className="field-input"
                type="text"
                autoComplete="name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="ชื่อที่จะแสดงในระบบ"
              />

              <label className="field-label" htmlFor="signup-email">อีเมล</label>
              <input
                id="signup-email"
                className="field-input"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <label className="field-label" htmlFor="signup-password">รหัสผ่าน</label>
              <input
                id="signup-password"
                className="field-input"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="field-hint">อย่างน้อย 12 ตัวอักษร</p>

              <button
                className="btn-primary full-width"
                type="submit"
                disabled={submitting}
              >
                {submitting ? 'กำลังสมัคร…' : 'สมัครสมาชิก'}
              </button>
            </form>
          </>
        )}

        <div className="auth-footer">
          มีบัญชีแล้ว?{' '}
          <Link to="/login" className="auth-link">เข้าสู่ระบบ</Link>
        </div>
      </div>
    </div>
  );
}
