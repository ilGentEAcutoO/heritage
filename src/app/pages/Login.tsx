/**
 * Login.tsx — magic-link request form.
 * On success: show "ส่งลิงก์ไปที่ <email> แล้ว".
 * On error: show error message.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient, type ApiError } from '@app/lib/api';

type State = 'idle' | 'loading' | 'success' | 'error';

export function Login() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<State>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setState('loading');
    setErrorMsg('');

    try {
      await apiClient.requestMagicLink(email.trim());
      setState('success');
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr.status === 429) {
        setErrorMsg('ส่งลิงก์บ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่');
      } else if (apiErr.status === 400) {
        setErrorMsg('อีเมลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง');
      } else {
        setErrorMsg('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
      }
      setState('error');
    }
  };

  const containerStyle: React.CSSProperties = {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
    fontFamily: 'Sarabun, serif',
    background: 'var(--bg, #faf8f4)',
    color: 'var(--ink, #2a1f14)',
  };

  const cardStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: '360px',
    background: 'var(--surface, #fff)',
    borderRadius: '10px',
    padding: '2rem',
    boxShadow: '0 2px 16px rgba(0,0,0,0.06)',
  };

  if (state === 'success') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h2
            style={{
              fontFamily: 'Cormorant Garamond, serif',
              fontSize: '1.6rem',
              margin: '0 0 1rem',
            }}
          >
            ตรวจอีเมลของคุณ
          </h2>
          <p style={{ margin: '0 0 1.5rem', lineHeight: 1.6 }}>
            ส่งลิงก์ไปที่ <strong>{email}</strong> แล้ว
            <br />
            คลิกลิงก์ในอีเมลเพื่อเข้าสู่ระบบ
          </p>
          <button
            onClick={() => {
              setState('idle');
              setEmail('');
            }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--leaf, #6b8f5e)',
              cursor: 'pointer',
              padding: 0,
              fontSize: '0.9rem',
            }}
          >
            ใช้อีเมลอื่น
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h2
          style={{
            fontFamily: 'Cormorant Garamond, serif',
            fontSize: '1.6rem',
            margin: '0 0 0.4rem',
          }}
        >
          เข้าสู่ระบบ
        </h2>
        <p style={{ margin: '0 0 1.5rem', opacity: 0.6, fontSize: '0.9rem' }}>
          ส่ง magic link ไปยังอีเมลของคุณ ไม่ต้องจำรหัสผ่าน
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={state === 'loading'}
            style={{
              padding: '0.65rem 0.85rem',
              borderRadius: '6px',
              border: '1.5px solid var(--border, #d4c9b6)',
              fontSize: '0.95rem',
              fontFamily: 'Sarabun, serif',
              background: 'var(--bg, #faf8f4)',
              color: 'var(--ink, #2a1f14)',
              outline: 'none',
            }}
          />

          {state === 'error' && (
            <p style={{ margin: 0, color: 'var(--danger, #c0392b)', fontSize: '0.85rem' }}>
              {errorMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={state === 'loading' || !email.trim()}
            style={{
              padding: '0.65rem',
              borderRadius: '6px',
              background: 'var(--leaf, #6b8f5e)',
              color: '#fff',
              border: 'none',
              cursor: state === 'loading' ? 'wait' : 'pointer',
              fontFamily: 'Sarabun, serif',
              fontSize: '0.95rem',
              fontWeight: 500,
              opacity: state === 'loading' ? 0.7 : 1,
            }}
          >
            {state === 'loading' ? 'กำลังส่ง...' : 'ส่ง magic link'}
          </button>
        </form>

        <p style={{ margin: '1.25rem 0 0', fontSize: '0.85rem', opacity: 0.55, textAlign: 'center' }}>
          <Link to="/" style={{ color: 'inherit', textDecoration: 'underline' }}>
            กลับหน้าหลัก
          </Link>
        </p>
      </div>
    </div>
  );
}
