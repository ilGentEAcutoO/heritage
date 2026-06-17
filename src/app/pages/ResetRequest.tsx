/**
 * ResetRequest.tsx — Request a password reset email.
 * Always shows the same success message regardless of whether the email exists.
 */

import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '@app/lib/api';
import type { ApiError } from '@app/lib/api';
import { AuthLogo } from '@app/components/AuthLogo';

export function ResetRequest() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    setSubmitting(true);
    try {
      await apiClient.requestReset(email);
      // Backend always 204 — show neutral message regardless
      setDone(true);
    } catch (err) {
      const apiErr = err as ApiError;
      void apiErr;
      // Even on network error, show neutral message to avoid enumeration
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <AuthLogo />

        <h1 className="auth-title">ลืมรหัสผ่าน?</h1>
        <p className="auth-subtitle">
          กรอกอีเมลที่ใช้สมัครสมาชิก
          <br />
          เราจะส่งลิงก์รีเซ็ตให้คุณ
        </p>

        {errorMsg && <div className="form-error" role="alert">{errorMsg}</div>}

        {done ? (
          <div className="auth-success" aria-live="polite">
            ถ้าอีเมลนี้มีบัญชีอยู่ในระบบ เราส่งลิงก์รีเซ็ตรหัสผ่านไปให้แล้ว
            <br />
            กรุณาตรวจสอบกล่องจดหมายของคุณ
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <label className="field-label" htmlFor="reset-email">อีเมล</label>
            <input
              id="reset-email"
              className="field-input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <button
              className="btn-primary full-width"
              type="submit"
              disabled={submitting}
            >
              {submitting ? 'กำลังส่ง…' : 'ส่งลิงก์รีเซ็ต'}
            </button>
          </form>
        )}

        <div className="auth-footer">
          <Link to="/login" className="auth-link">กลับไปหน้าเข้าสู่ระบบ</Link>
        </div>
      </div>
    </div>
  );
}
