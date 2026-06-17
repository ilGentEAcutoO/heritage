/**
 * Magic.tsx — Magic-link landing page (/auth/magic?token=…).
 *
 * Mirrors Verify.tsx pattern:
 * - On mount, reads ?token= from URL
 * - Missing token → redirect to /login?tab=magic
 * - Valid token → POST /api/auth/magic/consume → on 200: navigate to /trees
 * - On 400 → show error UI with retry link
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiClient } from '@app/lib/api';
import type { ApiError } from '@app/lib/api';
import { AuthLogo } from '@app/components/AuthLogo';

type Status = 'loading' | 'error';

export function Magic() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token');

  const [status, setStatus] = useState<Status>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    // No token → redirect immediately
    if (!token) {
      navigate('/login?tab=magic', { replace: true });
      return;
    }

    let cancelled = false;

    apiClient
      .consumeMagicLink(token)
      .then(() => {
        if (cancelled) return;
        // Session cookie set server-side; navigate to /trees
        navigate('/trees', { replace: true });
      })
      .catch((err: ApiError) => {
        if (cancelled) return;
        // Extract server message if present, fall back to neutral copy
        const msg =
          (err as unknown as { message?: string }).message ??
          'Link expired or already used';
        setErrorMessage(msg);
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [token, navigate]);

  return (
    <div className="auth-screen">
      <div className="auth-card is-status" aria-live="polite">
        <AuthLogo />

        {status === 'loading' && (
          <>
            <div className="auth-spinner" aria-hidden="true" />
            <h1 className="auth-title">กำลังเข้าสู่ระบบ…</h1>
            <p className="auth-body">Signing you in… กรุณารอสักครู่</p>
          </>
        )}

        {status === 'error' && (
          <>
            <h1 className="auth-title">ลิงก์หมดอายุ</h1>
            <div className="form-error" data-testid="magic-error" role="alert">
              {errorMessage || 'Link expired or already used'}
              <br />
              <small style={{ opacity: 0.8 }}>ลิงก์นี้ใช้ไปแล้วหรือหมดอายุแล้ว</small>
            </div>
            <p className="auth-body">
              <Link
                to="/login?tab=magic"
                className="btn-primary"
                data-testid="magic-retry-link"
              >
                ขอลิงก์ใหม่ (Request a new link)
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
