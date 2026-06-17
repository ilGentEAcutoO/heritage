/**
 * ResetPassword.tsx — Confirm new password via reset token.
 * Reads ?token= from URL. On success, redirects to /login?reset=1.
 */

import { useState, FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiClient } from '@app/lib/api';
import type { ApiError } from '@app/lib/api';
import { AuthLogo } from '@app/components/AuthLogo';

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
      <div className="auth-screen">
        <div className="auth-card is-status">
          <h1 className="auth-title">ลิงก์ไม่สมบูรณ์</h1>
          <div className="form-error" role="alert">ไม่พบ token สำหรับรีเซ็ตในลิงก์นี้</div>
          <Link to="/auth/reset" className="auth-link">ขอลิงก์ใหม่</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <AuthLogo />

        <h1 className="auth-title">ตั้งรหัสผ่านใหม่</h1>
        <p className="auth-subtitle">กรอกรหัสผ่านใหม่ที่ต้องการใช้</p>

        {errorMsg && <div className="form-error" role="alert">{errorMsg}</div>}

        <form onSubmit={handleSubmit}>
          <label className="field-label" htmlFor="rp-password">รหัสผ่านใหม่</label>
          <input
            id="rp-password"
            className="field-input"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <p className="field-hint">อย่างน้อย 12 ตัวอักษร</p>

          <label className="field-label" htmlFor="rp-confirm">ยืนยันรหัสผ่าน</label>
          <input
            id="rp-confirm"
            className="field-input"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />

          <button
            className="btn-primary full-width"
            type="submit"
            disabled={submitting}
          >
            {submitting ? 'กำลังบันทึก…' : 'ตั้งรหัสผ่านใหม่'}
          </button>
        </form>

        <div className="auth-footer">
          <Link to="/auth/reset" className="auth-link">ขอลิงก์ใหม่</Link>
          {' · '}
          <Link to="/login" className="auth-link">เข้าสู่ระบบ</Link>
        </div>
      </div>
    </div>
  );
}
