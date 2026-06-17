/**
 * ShareDialog.tsx — modal for managing tree visibility and share invites.
 *
 * Props:
 *   slug              — tree slug (used for API calls)
 *   currentVisibility — initial visibility from TreeData.meta.visibility
 *   open              — controlled open state
 *   onClose           — callback to close
 *
 * Shell (overlay, focus-trap, ESC, click-outside, entrance) comes from <Modal>;
 * form styling from the shared .field-* / .btn-* classes. Bespoke list rows and
 * one-off layout keep minimal inline styles built from design tokens.
 */

import { useState, useEffect, useCallback, FormEvent, useRef } from 'react';
import { apiClient } from '@app/lib/api';
import type { Share } from '@app/lib/api';
import { Modal } from './Modal';

type Visibility = 'public' | 'private' | 'shared';

interface ShareDialogProps {
  slug: string;
  currentVisibility: Visibility;
  open: boolean;
  onClose: () => void;
}

const sectionLabel = {
  fontSize: '0.72rem',
  fontWeight: 700 as const,
  letterSpacing: '0.07em',
  textTransform: 'uppercase' as const,
  color: 'var(--ink-faint)',
  marginBottom: '0.6rem',
  display: 'block',
};

const radioRow = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '0.6rem',
  padding: '0.6rem 0.7rem',
  borderRadius: '12px',
  border: '1px solid var(--line)',
  background: 'var(--paper)',
};

const radioRowActive = {
  // Override the full `border` shorthand (not just borderColor) so the active
  // state never mixes shorthand + longhand for the same element — React warns
  // ("don't mix shorthand and non-shorthand") when those alternate on rerender.
  border: '1px solid var(--leaf)',
  background: 'var(--leaf-soft)',
};

const divider = {
  border: 'none',
  borderTop: '1px solid var(--line)',
  margin: '1.25rem 0',
};

const shareItem = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.6rem',
  padding: '0.55rem 0.7rem',
  borderRadius: '12px',
  border: '1px solid var(--line)',
  background: 'var(--paper)',
  fontSize: '0.88rem',
};

const statusBadge = (status: string) => ({
  fontSize: '0.68rem',
  fontWeight: 600 as const,
  padding: '0.2rem 0.55rem',
  borderRadius: '999px',
  background:
    status === 'accepted'
      ? 'var(--leaf-soft)'
      : status === 'revoked'
      ? 'var(--paper-2)'
      : 'var(--blossom-soft)',
  color:
    status === 'accepted'
      ? 'var(--leaf-strong)'
      : status === 'revoked'
      ? 'var(--ink-faint)'
      : 'var(--blossom)',
});

const VISIBILITY_OPTIONS: { value: Visibility; label: string; desc: string }[] = [
  { value: 'public', label: 'สาธารณะ (Public)', desc: 'ทุกคนดูได้โดยไม่ต้องเข้าสู่ระบบ' },
  { value: 'shared', label: 'แชร์เฉพาะคน (Shared)', desc: 'เฉพาะคนที่ได้รับเชิญเท่านั้น' },
  { value: 'private', label: 'ส่วนตัว (Private)', desc: 'เจ้าของเท่านั้นที่ดูได้' },
];

export function ShareDialog({ slug, currentVisibility, open, onClose }: ShareDialogProps) {
  const [visibility, setVisibility] = useState<Visibility>(currentVisibility);
  const [shares, setShares] = useState<Share[]>([]);
  const [sharesLoading, setSharesLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'viewer' | 'editor'>('viewer');
  const [inviting, setInviting] = useState(false);
  const [visChanging, setVisChanging] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchShares = useCallback(async () => {
    setSharesLoading(true);
    setErrorMsg('');
    try {
      const { shares: s } = await apiClient.getShares(slug);
      setShares(s);
    } catch {
      setErrorMsg('โหลดรายการผู้เข้าถึงไม่ได้');
    } finally {
      setSharesLoading(false);
    }
  }, [slug]);

  // Sync local visibility if parent prop changes (e.g. after PATCH)
  useEffect(() => {
    setVisibility(currentVisibility);
  }, [currentVisibility]);

  // Fetch shares when dialog opens and visibility is 'shared'
  useEffect(() => {
    if (!open) return;
    if (visibility === 'shared') fetchShares();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Fetch shares whenever visibility switches to 'shared'
  useEffect(() => {
    if (!open) return;
    if (visibility === 'shared') fetchShares();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibility]);

  // Clear the copy-confirmation timer on unmount (the dialog unmounts on close)
  // so the 2s timeout can't fire setCopied on an unmounted component.
  useEffect(() => () => {
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
  }, []);

  if (!open) return null;

  async function handleCopyLink() {
    const url = `${location.origin}/tree/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback: create a temporary textarea and use execCommand
      try {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        // Last resort: do nothing (URL shown in button title)
      }
    }
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    setCopied(true);
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
  }

  async function handleVisibilityChange(v: Visibility) {
    setVisChanging(true);
    setErrorMsg('');
    try {
      const { visibility: updated } = await apiClient.setVisibility(slug, v);
      setVisibility(updated);
    } catch {
      setErrorMsg('เปลี่ยนการมองเห็นไม่ได้ — ลองอีกครั้ง');
    } finally {
      setVisChanging(false);
    }
  }

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setErrorMsg('');
    try {
      await apiClient.addShare(slug, { email: inviteEmail.trim(), role: inviteRole });
      setInviteEmail('');
      await fetchShares();
    } catch (err) {
      const apiErr = err as { status?: number };
      if (apiErr.status === 409) {
        setErrorMsg('อีเมลนี้ได้รับเชิญไปแล้ว');
      } else if (apiErr.status === 404) {
        setErrorMsg('ไม่พบอีเมลนี้ในระบบ');
      } else {
        setErrorMsg('ส่งคำเชิญไม่ได้ — ลองอีกครั้ง');
      }
    } finally {
      setInviting(false);
    }
  }

  async function handleRevoke(shareId: string) {
    setErrorMsg('');
    try {
      await apiClient.revokeShare(slug, shareId);
      await fetchShares();
    } catch {
      setErrorMsg('ยกเลิกสิทธิ์ไม่ได้ — ลองอีกครั้ง');
    }
  }

  const activeShares = shares.filter((s) => s.status !== 'revoked');

  return (
    <Modal onClose={onClose} label="จัดการการแชร์ต้นไม้" size="lg">
      <h2 className="modal-title" id="share-dialog-title">จัดการการแชร์</h2>

      {/* Visibility section */}
      <span style={sectionLabel}>การมองเห็น</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {VISIBILITY_OPTIONS.map((opt) => {
          const isActive = visibility === opt.value;
          return (
            <label
              key={opt.value}
              style={{
                ...radioRow,
                ...(isActive ? radioRowActive : {}),
                cursor: visChanging ? 'wait' : 'pointer',
              }}
            >
              <input
                type="radio"
                name="visibility"
                value={opt.value}
                checked={isActive}
                disabled={visChanging}
                onChange={() => handleVisibilityChange(opt.value)}
                style={{ marginTop: '0.1rem', accentColor: 'var(--leaf)' }}
              />
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--ink)' }}>{opt.label}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', marginTop: '0.1rem' }}>{opt.desc}</div>
              </div>
            </label>
          );
        })}
      </div>

      {/* Copy link section — only shown when public */}
      {visibility === 'public' && (
        <>
          <hr style={divider} />
          <span style={sectionLabel}>ลิงก์สาธารณะ</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.25rem' }}>
            <button
              type="button"
              data-testid="share-copy-link"
              className="btn-primary"
              onClick={handleCopyLink}
              title={`${location.origin}/tree/${slug}`}
            >
              คัดลอกลิงก์
            </button>
            {copied && (
              <span style={{ fontSize: '0.85rem', color: 'var(--leaf-strong)', fontWeight: 600 }} aria-live="polite">คัดลอกแล้ว ✓</span>
            )}
          </div>
        </>
      )}

      {/* Invite section — only shown when shared */}
      {visibility === 'shared' && (
        <>
          <hr style={divider} />
          <span style={sectionLabel}>เชิญผู้เข้าถึง</span>

          {errorMsg && <div className="form-error" role="alert">{errorMsg}</div>}

          <form onSubmit={handleInvite}>
            <div style={{ display: 'flex', gap: '0.5rem', margin: '1rem 0' }}>
              <input
                className="field-input"
                style={{ flex: 1 }}
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="อีเมล"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
                disabled={inviting}
                aria-label="อีเมลผู้รับเชิญ"
              />
              <select
                className="field-input"
                style={{ width: 'auto', cursor: 'pointer', fontSize: '0.85rem' }}
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'viewer' | 'editor')}
                disabled={inviting}
                aria-label="บทบาท"
              >
                <option value="viewer">ดูได้</option>
                <option value="editor">แก้ไขได้</option>
              </select>
              <button
                className="btn-primary"
                style={{ whiteSpace: 'nowrap' }}
                type="submit"
                disabled={inviting}
              >
                {inviting ? '…' : 'เชิญ'}
              </button>
            </div>
          </form>

          {/* Share list */}
          {sharesLoading ? (
            <p style={{ color: 'var(--ink-faint)', fontSize: '0.85rem', padding: '0.5rem 0' }} aria-live="polite">กำลังโหลด…</p>
          ) : activeShares.length === 0 ? (
            <p style={{ color: 'var(--ink-faint)', fontSize: '0.85rem', padding: '0.5rem 0' }}>ยังไม่มีผู้เข้าถึง</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {activeShares.map((share) => (
                <li key={share.id} style={shareItem}>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={share.email}>
                    {share.email}
                  </span>
                  <span style={{ fontSize: '0.78rem', opacity: 0.55 }}>
                    {share.role === 'editor' ? 'แก้ไขได้' : 'ดูได้'}
                  </span>
                  <span style={statusBadge(share.status)}>
                    {share.status === 'accepted'
                      ? 'รับแล้ว'
                      : share.status === 'pending'
                      ? 'รอดำเนินการ'
                      : 'ยกเลิกแล้ว'}
                  </span>
                  <button
                    className="btn-ghost"
                    style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                    onClick={() => handleRevoke(share.id)}
                    title="ยกเลิกสิทธิ์"
                  >
                    ยกเลิก
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* Error when NOT in shared mode */}
      {visibility !== 'shared' && errorMsg && (
        <div className="form-error" role="alert">{errorMsg}</div>
      )}

      <div className="modal-actions">
        <button type="button" className="btn-secondary" onClick={onClose} aria-label="ปิด">
          ปิด
        </button>
      </div>
    </Modal>
  );
}
