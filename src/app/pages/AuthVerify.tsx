/**
 * AuthVerify.tsx — fallback page for /auth/verify
 *
 * The Worker normally handles /api/auth/verify and 302-redirects the browser.
 * This React page only renders if the user navigates to the client-side route
 * (e.g., direct bookmark, back-nav) or if the Worker redirected to this path
 * with ?err=invalid.
 */

import { useSearchParams, Link } from 'react-router-dom';

export function AuthVerify() {
  const [params] = useSearchParams();
  const err = params.get('err');

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

  if (err === 'invalid') {
    return (
      <div style={containerStyle}>
        <h2
          style={{
            fontFamily: 'Cormorant Garamond, serif',
            fontSize: '1.5rem',
            margin: '0 0 0.75rem',
          }}
        >
          ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว
        </h2>
        <p style={{ margin: '0 0 1.5rem', opacity: 0.65 }}>
          กรุณาขอลิงก์ใหม่อีกครั้ง
        </p>
        <Link
          to="/login"
          style={{
            padding: '0.6rem 1.4rem',
            borderRadius: '6px',
            background: 'var(--leaf, #6b8f5e)',
            color: '#fff',
            textDecoration: 'none',
            fontWeight: 500,
          }}
        >
          ขอลิงก์ใหม่
        </Link>
      </div>
    );
  }

  // Default: "Verifying..." state — Worker should have redirected already
  return (
    <div style={containerStyle}>
      <p style={{ opacity: 0.65 }}>กำลังตรวจสอบ...</p>
    </div>
  );
}
