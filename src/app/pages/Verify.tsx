/**
 * Verify.tsx — Email verification page.
 * Reads ?token= from URL, auto-POSTs on mount, shows loading/success/fail.
 */

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiClient } from '@app/lib/api';
import type { ApiError } from '@app/lib/api';
import { AuthLogo } from '@app/components/AuthLogo';

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
    <div className="auth-screen">
      <div className="auth-card is-status" aria-live="polite">
        <AuthLogo />

        {status === 'loading' && (
          <>
            <h1 className="auth-title">กำลังยืนยันอีเมล…</h1>
            <p className="auth-body">กรุณารอสักครู่</p>
          </>
        )}

        {status === 'success' && (
          <>
            <h1 className="auth-title">ยืนยันอีเมลสำเร็จ!</h1>
            <div className="auth-success">บัญชีของคุณพร้อมใช้งานแล้ว กำลังพาคุณไป…</div>
          </>
        )}

        {status === 'error' && (
          <>
            <h1 className="auth-title">ลิงก์หมดอายุ</h1>
            <div className="form-error" role="alert">
              ลิงก์ยืนยันนี้ใช้ไปแล้วหรือหมดอายุแล้ว
            </div>
            <p className="auth-body">
              <Link to="/login" className="auth-link">เข้าสู่ระบบ</Link>
              {' หรือ '}
              <Link to="/signup" className="auth-link">สมัครสมาชิกใหม่</Link>
            </p>
          </>
        )}

        {status === 'missing' && (
          <>
            <h1 className="auth-title">ลิงก์ไม่สมบูรณ์</h1>
            <div className="form-error" role="alert">ไม่พบ token สำหรับยืนยันในลิงก์นี้</div>
            <p className="auth-body">
              <Link to="/login" className="auth-link">กลับไปหน้าเข้าสู่ระบบ</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
