/**
 * UserMenu.tsx — Session-aware user menu dropdown for the app header.
 *
 * Renders a trigger button that toggles a dropdown panel:
 *  - Guest state: shows Home link + Login link
 *  - Auth state: shows displayName, Home link, My Trees link, and Logout button
 *
 * Closes on Escape key, click-outside, or after any item interaction.
 */

import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '@app/hooks/useSession';

export interface UserMenuProps {
  className?: string;
}

export function UserMenu({ className }: UserMenuProps): JSX.Element | null {
  const { user, loading, logout } = useSession();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  if (loading) return null;

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
    } catch {
      // best-effort — session cache is cleared even on network error
    } finally {
      setLoggingOut(false);
    }
    setOpen(false);
  }

  const triggerLabel = user
    ? (user.displayName ?? user.email).charAt(0).toUpperCase()
    : '👤';

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }} className={className}>
      <button
        type="button"
        data-testid="user-menu-trigger"
        className="header-btn"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((prev) => !prev)}
        style={{ minWidth: 36, justifyContent: 'center' }}
      >
        {triggerLabel}
      </button>

      {open && (
        <div
          data-testid="user-menu"
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            minWidth: 200,
            background: 'var(--paper)',
            border: '1px solid var(--line)',
            borderRadius: 14,
            boxShadow: 'var(--shadow)',
            zIndex: 1000,
            padding: '6px',
            fontFamily: '"Prompt", system-ui, sans-serif',
            fontSize: 14,
          }}
        >
          {user ? (
            <>
              {/* Auth header */}
              <div
                style={{
                  padding: '10px 12px 10px',
                  borderBottom: '1px solid var(--line)',
                  marginBottom: 4,
                }}
              >
                <div style={{ fontWeight: 600, color: 'var(--ink)' }}>
                  {user.displayName ?? user.email}
                </div>
                {user.displayName && (
                  <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
                    {user.email}
                  </div>
                )}
              </div>

              {/* Home */}
              <Link
                to="/"
                data-testid="user-menu-item-home"
                role="menuitem"
                onClick={() => setOpen(false)}
                style={{
                  display: 'block',
                  padding: '8px 12px',
                  borderRadius: 12,
                  color: 'var(--ink)',
                  textDecoration: 'none',
                }}
              >
                🏠 หน้าหลัก
              </Link>

              {/* Trees */}
              <Link
                to="/trees"
                data-testid="user-menu-item-trees"
                role="menuitem"
                onClick={() => setOpen(false)}
                style={{
                  display: 'block',
                  padding: '8px 12px',
                  borderRadius: 12,
                  color: 'var(--ink)',
                  textDecoration: 'none',
                }}
              >
                🌳 ต้นไม้ของฉัน
              </Link>

              {/* Logout */}
              <button
                type="button"
                data-testid="user-menu-item-logout"
                role="menuitem"
                onClick={handleLogout}
                disabled={loggingOut}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 12px',
                  borderRadius: 12,
                  background: 'transparent',
                  border: 'none',
                  cursor: loggingOut ? 'wait' : 'pointer',
                  color: 'var(--blossom)',
                  fontFamily: '"Prompt", system-ui, sans-serif',
                  fontSize: 14,
                  fontWeight: 600,
                  opacity: loggingOut ? 0.4 : 1,
                }}
              >
                {loggingOut ? 'กำลังออก…' : 'ออกจากระบบ'}
              </button>
            </>
          ) : (
            <>
              {/* Home */}
              <Link
                to="/"
                data-testid="user-menu-item-home"
                role="menuitem"
                onClick={() => setOpen(false)}
                style={{
                  display: 'block',
                  padding: '8px 12px',
                  borderRadius: 12,
                  color: 'var(--ink)',
                  textDecoration: 'none',
                }}
              >
                🏠 หน้าหลัก
              </Link>

              {/* Login */}
              <Link
                to="/login"
                data-testid="user-menu-item-login"
                role="menuitem"
                onClick={() => setOpen(false)}
                style={{
                  display: 'block',
                  padding: '8px 12px',
                  borderRadius: 12,
                  color: 'var(--leaf-strong)',
                  textDecoration: 'none',
                  fontWeight: 600,
                }}
              >
                เข้าสู่ระบบ
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
