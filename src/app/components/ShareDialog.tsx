/**
 * ShareDialog.tsx — modal for managing tree visibility and share invites.
 *
 * Props:
 *   slug              — tree slug (used for API calls)
 *   currentVisibility — initial visibility from TreeData.meta.visibility
 *   open              — controlled open state
 *   onClose           — callback to close
 */

import { useState, useEffect, useCallback, FormEvent, useRef } from 'react';
import { apiClient } from '@app/lib/api';
import type { Share } from '@app/lib/api';

type Visibility = 'public' | 'private' | 'shared';

interface ShareDialogProps {
  slug: string;
  currentVisibility: Visibility;
  open: boolean;
  onClose: () => void;
}

const s = {
  backdrop: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(42,31,20,0.45)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialog: {
    position: 'relative' as const,
    background: '#fff',
    border: '1px solid var(--line, #e4ddd4)',
    borderRadius: '10px',
    padding: '1.75rem',
    width: '100%',
    maxWidth: '520px',
    maxHeight: '90vh',
    overflowY: 'auto' as const,
    boxShadow: '0 8px 40px rgba(42,31,20,0.18)',
    fontFamily: 'Sarabun, serif',
    color: 'var(--ink, #2a1f14)',
  },
  heading: {
    fontFamily: 'Cormorant Garamond, serif',
    fontSize: '1.4rem',
    fontWeight: 600 as const,
    margin: '0 0 1.25rem',
  },
  closeBtn: {
    position: 'absolute' as const,
    top: '1rem',
    right: '1rem',
    background: 'none',
    border: 'none',
    fontSize: '1.2rem',
    cursor: 'pointer',
    opacity: 0.5,
    lineHeight: 1,
    padding: '0.2rem 0.4rem',
    borderRadius: '4px',
  },
  sectionLabel: {
    fontSize: '0.72rem',
    fontWeight: 700 as const,
    letterSpacing: '0.07em',
    textTransform: 'uppercase' as const,
    opacity: 0.45,
    marginBottom: '0.6rem',
    display: 'block',
  },
  radioGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.5rem',
    marginBottom: '1.5rem',
  },
  radioRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.6rem',
    cursor: 'pointer',
    padding: '0.5rem 0.6rem',
    borderRadius: '6px',
    border: '1px solid var(--line, #e4ddd4)',
  },
  radioRowActive: {
    borderColor: 'var(--leaf, #6b8f5e)',
    background: 'rgba(107,143,94,0.06)',
  },
  radioLabel: {
    fontWeight: 600 as const,
    fontSize: '0.9rem',
  },
  radioDesc: {
    fontSize: '0.78rem',
    opacity: 0.55,
    marginTop: '0.1rem',
  },
  divider: {
    border: 'none',
    borderTop: '1px solid var(--line, #e4ddd4)',
    margin: '1.25rem 0',
  },
  inviteRow: {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '1rem',
  },
  input: {
    flex: 1,
    padding: '0.55rem 0.7rem',
    border: '1px solid var(--line, #ddd)',
    borderRadius: '5px',
    fontFamily: 'Sarabun, serif',
    fontSize: '0.9rem',
    color: 'var(--ink, #2a1f14)',
    background: 'var(--bg, #faf8f4)',
  },
  select: {
    padding: '0.55rem 0.5rem',
    border: '1px solid var(--line, #ddd)',
    borderRadius: '5px',
    fontFamily: 'Sarabun, serif',
    fontSize: '0.85rem',
    color: 'var(--ink, #2a1f14)',
    background: 'var(--bg, #faf8f4)',
    cursor: 'pointer',
  },
  inviteBtn: {
    padding: '0.55rem 1rem',
    background: 'var(--leaf, #6b8f5e)',
    color: '#fff',
    border: 'none',
    borderRadius: '5px',
    fontFamily: 'Sarabun, serif',
    fontWeight: 600 as const,
    fontSize: '0.9rem',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    transition: 'opacity 0.15s',
  },
  shareList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.4rem',
  },
  shareItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
    padding: '0.5rem 0.6rem',
    borderRadius: '5px',
    border: '1px solid var(--line, #e4ddd4)',
    fontSize: '0.88rem',
  },
  shareEmail: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  statusBadge: (status: string) => ({
    fontSize: '0.68rem',
    fontWeight: 600 as const,
    padding: '0.15rem 0.45rem',
    borderRadius: '99px',
    background:
      status === 'accepted'
        ? 'rgba(107,143,94,0.15)'
        : status === 'revoked'
        ? '#f3f3f3'
        : 'rgba(196,133,90,0.15)',
    color:
      status === 'accepted'
        ? 'var(--leaf, #6b8f5e)'
        : status === 'revoked'
        ? '#999'
        : 'var(--blossom, #c4855a)',
  }),
  revokeBtn: {
    background: 'none',
    border: '1px solid var(--line, #ddd)',
    borderRadius: '4px',
    padding: '0.2rem 0.5rem',
    fontSize: '0.75rem',
    cursor: 'pointer',
    color: '#999',
    fontFamily: 'Sarabun, serif',
    transition: 'border-color 0.15s, color 0.15s',
  },
  error: {
    background: '#fef2f2',
    border: '1px solid #fca5a5',
    borderRadius: '5px',
    padding: '0.5rem 0.7rem',
    fontSize: '0.825rem',
    color: '#991b1b',
    marginBottom: '0.75rem',
  },
  loading: {
    opacity: 0.4,
    fontSize: '0.85rem',
    padding: '0.5rem 0',
  },
};

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
  const dialogRef = useRef<HTMLDivElement>(null);

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

  // Close on Esc
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

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
    <div
      style={s.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        style={s.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="จัดการการแชร์ต้นไม้"
      >
        <button
          style={s.closeBtn}
          onClick={onClose}
          aria-label="ปิด"
          title="ปิด (Esc)"
        >
          ✕
        </button>

        <h2 style={s.heading}>จัดการการแชร์</h2>

        {/* Visibility section */}
        <span style={s.sectionLabel}>การมองเห็น</span>
        <div style={s.radioGroup}>
          {VISIBILITY_OPTIONS.map((opt) => {
            const isActive = visibility === opt.value;
            return (
              <label
                key={opt.value}
                style={{
                  ...s.radioRow,
                  ...(isActive ? s.radioRowActive : {}),
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
                  style={{ marginTop: '0.1rem', accentColor: 'var(--leaf, #6b8f5e)' }}
                />
                <div>
                  <div style={s.radioLabel}>{opt.label}</div>
                  <div style={s.radioDesc}>{opt.desc}</div>
                </div>
              </label>
            );
          })}
        </div>

        {/* Invite section — only shown when shared */}
        {visibility === 'shared' && (
          <>
            <hr style={s.divider} />
            <span style={s.sectionLabel}>เชิญผู้เข้าถึง</span>

            {errorMsg && <div style={s.error}>{errorMsg}</div>}

            <form onSubmit={handleInvite}>
              <div style={s.inviteRow}>
                <input
                  style={s.input}
                  type="email"
                  placeholder="อีเมล"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                  disabled={inviting}
                  aria-label="อีเมลผู้รับเชิญ"
                />
                <select
                  style={s.select}
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as 'viewer' | 'editor')}
                  disabled={inviting}
                  aria-label="บทบาท"
                >
                  <option value="viewer">ดูได้</option>
                  <option value="editor">แก้ไขได้</option>
                </select>
                <button
                  style={{ ...s.inviteBtn, opacity: inviting ? 0.65 : 1 }}
                  type="submit"
                  disabled={inviting}
                >
                  {inviting ? '…' : 'เชิญ'}
                </button>
              </div>
            </form>

            {/* Share list */}
            {sharesLoading ? (
              <p style={s.loading}>กำลังโหลด…</p>
            ) : activeShares.length === 0 ? (
              <p style={{ ...s.loading, fontSize: '0.85rem' }}>ยังไม่มีผู้เข้าถึง</p>
            ) : (
              <ul style={s.shareList}>
                {activeShares.map((share) => (
                  <li key={share.id} style={s.shareItem}>
                    <span style={s.shareEmail} title={share.email}>
                      {share.email}
                    </span>
                    <span style={{ fontSize: '0.78rem', opacity: 0.55 }}>
                      {share.role === 'editor' ? 'แก้ไขได้' : 'ดูได้'}
                    </span>
                    <span style={s.statusBadge(share.status)}>
                      {share.status === 'accepted'
                        ? 'รับแล้ว'
                        : share.status === 'pending'
                        ? 'รอดำเนินการ'
                        : 'ยกเลิกแล้ว'}
                    </span>
                    <button
                      style={s.revokeBtn}
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
          <div style={s.error}>{errorMsg}</div>
        )}
      </div>
    </div>
  );
}
