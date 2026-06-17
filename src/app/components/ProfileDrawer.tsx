import { useState, useRef } from 'react';
import type { Person, TreeData } from '@app/lib/types';
import type { ApiError } from '@app/lib/api';
import { computeRelation } from '@app/lib/kinship';
import { Tab } from './Tab';

// Mirrors the server caps in worker/routes/photos.ts (MAX_BYTES + ALLOWED_MIME_TYPES).
// Client-side checks give instant feedback; the server re-validates as the authority.
const MAX_PHOTO_MB = 5;
const MAX_PHOTO_BYTES = MAX_PHOTO_MB * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Map a failed photo upload/delete into a user-facing Thai message. Covers the
 * abuse-hardening limits (413 too_large, 415 unsupported_type, 429 rate_limited)
 * so the user is told *why* the action failed rather than a blank "try again".
 */
function photoErrorMessage(e: unknown, fallback: string): string {
  const err = e as ApiError;
  if (err.status === 413 || err.error === 'too_large')
    return `ไฟล์ใหญ่เกิน ${MAX_PHOTO_MB} MB — เลือกรูปที่เล็กกว่านี้`;
  if (err.status === 415 || err.error === 'unsupported_type')
    return 'รองรับเฉพาะไฟล์รูป JPG, PNG หรือ WebP';
  if (err.status === 429 || err.error === 'rate_limited')
    return 'ปรับเปลี่ยนรูปบ่อยเกินไป รอสักครู่แล้วลองใหม่';
  if (err.status === 401) return 'กรุณาเข้าสู่ระบบใหม่';
  return fallback;
}

export interface ProfileDrawerProps {
  person: Person;
  data: TreeData;
  onClose: () => void;
  onJumpTo: (id: string) => void;
  expandedLineages: Set<string>;
  onToggleLineage: (personId: string) => void;
  onSetActiveView?: (id: string) => void;
  isActiveView?: boolean;
  onSetStatus?: (personId: string, deceased: boolean, died: number | null) => void;
  canEdit?: boolean;
  /** Called by owner edit-mode save. Patch is sent to the server by TreeView. */
  onUpdatePerson?: (
    personId: string,
    patch: Partial<{ name: string; nameEn: string | null; nick: string | null; born: number | null; hometown: string | null; gender: 'm' | 'f'; deceased: boolean; died: number | null }>,
  ) => Promise<void>;
  /** Called by owner delete button after confirmation. */
  onDeletePerson?: (personId: string) => Promise<void>;
  /** Called when owner uploads a photo for a person. */
  onUploadPhoto?: (personId: string, file: File) => Promise<void>;
  /** Called when owner deletes a photo. */
  onDeletePhoto?: (personId: string, photoId: string) => Promise<void>;
}

/**
 * Compute the relational label for a person from the "me" perspective.
 * Ported from `computeRole` at the end of panels.jsx.
 */
function computeRole(people: Person[], person: Person): string {
  if (person.isMe) return 'ฉันเอง / Me';
  const me = people.find(p => p.isMe);
  if (!me) return '';
  const rel = computeRelation(people, me.id, person.id);
  return rel || 'ญาติ';
}

/**
 * Profile drawer — ported from `function ProfileDrawer(...)` in panels.jsx.
 * Shows profile header, optional lineage-link panel, and Family/Stories/Photos/Voice tabs.
 */
export function ProfileDrawer({
  person,
  data,
  onClose,
  onJumpTo,
  expandedLineages,
  onToggleLineage,
  onSetActiveView,
  isActiveView,
  onSetStatus,
  canEdit,
  onUpdatePerson,
  onDeletePerson,
  onUploadPhoto,
  onDeletePhoto,
}: ProfileDrawerProps) {
  // Edit mode state
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState('');
  const [editNick, setEditNick] = useState('');
  const [editBorn, setEditBorn] = useState('');
  const [editHometown, setEditHometown] = useState('');
  const [editGender, setEditGender] = useState<'m' | 'f'>('m');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // Delete confirm state
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Photo upload state
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const photoFileInputRef = useRef<HTMLInputElement>(null);

  if (!person) return null;

  function openEditMode() {
    setEditName(person.name ?? '');
    setEditNick(person.nick ?? '');
    setEditBorn(person.born != null ? String(person.born) : '');
    setEditHometown(person.hometown ?? '');
    setEditGender(person.gender ?? 'm');
    setEditError('');
    setEditMode(true);
  }

  function closeEditMode() {
    setEditMode(false);
    setEditError('');
  }

  async function handleEditSave() {
    if (!onUpdatePerson) return;
    setEditSaving(true);
    setEditError('');
    try {
      const bornNum = editBorn.trim() ? parseInt(editBorn.trim(), 10) : null;
      await onUpdatePerson(person.id, {
        name: editName.trim() || undefined,
        nick: editNick.trim() || null,
        born: bornNum !== null && !isNaN(bornNum) ? bornNum : null,
        hometown: editHometown.trim() || null,
        gender: editGender,
      });
      setEditMode(false);
    } catch {
      setEditError('บันทึกไม่สำเร็จ — ลองใหม่อีกครั้ง');
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete() {
    if (!onDeletePerson) return;
    setDeleting(true);
    try {
      await onDeletePerson(person.id);
    } catch {
      setDeleting(false);
      setDeleteConfirm(false);
    }
  }

  async function handlePhotoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !onUploadPhoto) return;
    setPhotoError('');

    // Client-side guards: instant feedback before spending an upload round-trip.
    // (The server re-checks both and remains the authority.)
    const clearInput = () => {
      if (photoFileInputRef.current) photoFileInputRef.current.value = '';
    };
    if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
      setPhotoError('รองรับเฉพาะไฟล์รูป JPG, PNG หรือ WebP');
      clearInput();
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError(`ไฟล์ใหญ่เกิน ${MAX_PHOTO_MB} MB — เลือกรูปที่เล็กกว่านี้`);
      clearInput();
      return;
    }

    setUploading(true);
    try {
      await onUploadPhoto(person.id, file);
    } catch (err) {
      setPhotoError(photoErrorMessage(err, 'อัปโหลดไม่สำเร็จ — ลองใหม่อีกครั้ง'));
    } finally {
      setUploading(false);
      clearInput(); // allow re-uploading the same file after an error
    }
  }

  async function handleDeletePhoto(photoId: string) {
    if (!onDeletePhoto) return;
    setPhotoError('');
    try {
      await onDeletePhoto(person.id, photoId);
    } catch (err) {
      // Surface rate-limit / auth failures; other errors fall back to a generic
      // message (refetch from parent still reconciles the true state).
      setPhotoError(photoErrorMessage(err, 'ลบรูปไม่สำเร็จ — ลองใหม่อีกครั้ง'));
    }
  }

  const stories = (data.stories?.[person.id] || []);
  const memos = (data.memos?.[person.id] || []);
  const photoCount = data.photos?.[person.id] || 0;
  const photoItems = data.photoList?.[person.id] ?? [];

  const parents = (person.parents || [])
    .map(id => data.people.find(p => p.id === id))
    .filter((p): p is Person => Boolean(p));

  const spouse = person.spouseOf
    ? data.people.find(p => p.id === person.spouseOf) ?? null
    : null;

  const children = data.people.filter(
    p => p.parents && p.parents.includes(person.id),
  );

  const siblings = parents.length
    ? data.people.filter(
        p =>
          p.id !== person.id &&
          p.parents &&
          p.parents.some(id => (person.parents || []).includes(id)),
      )
    : [];

  const lineage = data.externalLineages?.[person.id];
  const isExpanded = expandedLineages.has(person.id);
  const hasNoAncestors = !person.parents || person.parents.length === 0;

  const familyCount =
    parents.length + (spouse ? 1 : 0) + children.length + siblings.length;

  return (
    <aside className="drawer">
      <button className="drawer-close" onClick={onClose}>
        ×
      </button>

      {/* Profile header */}
      <div className="profile-header">
        <div className="profile-photo">
          <svg viewBox="0 0 120 120" width="120" height="120">
            <defs>
              <pattern
                id={`big-stripe-${person.id}`}
                patternUnits="userSpaceOnUse"
                width="12"
                height="12"
                patternTransform="rotate(45)"
              >
                <rect
                  width="12"
                  height="12"
                  fill={
                    person.gender === 'f'
                      ? 'oklch(0.86 0.04 40)'
                      : 'oklch(0.84 0.03 200)'
                  }
                />
                <rect
                  width="6"
                  height="12"
                  fill={
                    person.gender === 'f'
                      ? 'oklch(0.80 0.05 40)'
                      : 'oklch(0.78 0.04 200)'
                  }
                />
              </pattern>
            </defs>
            <circle
              cx="60"
              cy="60"
              r="56"
              fill={`url(#big-stripe-${person.id})`}
              stroke="var(--ink)"
              strokeWidth="2"
            />
            <text
              x="60"
              y="75"
              textAnchor="middle"
              fontFamily='"Prompt", system-ui, sans-serif'
              fontSize="48"
              fontWeight="600"
              fill="var(--ink)"
              opacity="0.75"
            >
              {(person.name || '').charAt(0)}
            </text>
          </svg>
          {canEdit && onUploadPhoto && (
            <button
              type="button"
              data-testid="photo-upload-button-header"
              className="photo-upload-btn"
              onClick={() => photoFileInputRef.current?.click()}
              disabled={uploading}
            >
              + เพิ่มรูป
            </button>
          )}
        </div>

        <div className="profile-ident">
          <div className="profile-role">{computeRole(data.people, person)}</div>
          <h2 className="profile-name">{person.name}</h2>
          <div className="profile-name-en">{person.nameEn}</div>
          <div className="profile-meta">
            <span className="meta-chip">
              <span>ปีเกิด</span>
              {person.born}
            </span>
            {person.deceased && (
              <span className="meta-chip passed">
                <span>เสียชีวิต</span>
                {person.died != null ? person.died : 'ไม่ทราบปี'}
              </span>
            )}
            <span className="meta-chip">
              <span>จาก</span>
              {person.hometown}
            </span>
          </div>

          {/* Status edit control — only rendered when onSetStatus is provided */}
          {onSetStatus && (
            <div className="profile-status-edit" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button
                data-testid="status-toggle"
                type="button"
                role="switch"
                aria-checked={person.deceased}
                aria-label="สถานะ: เสียชีวิต"
                className="meta-chip"
                style={{ cursor: 'pointer', borderRadius: 'var(--radius-pill)', background: person.deceased ? 'var(--blossom-soft)' : 'var(--leaf-soft)', color: 'var(--ink)', border: '1px solid var(--line)' }}
                onClick={() => {
                  if (person.deceased) {
                    onSetStatus(person.id, false, null);
                  } else {
                    onSetStatus(person.id, true, person.died ?? null);
                  }
                }}
              >
                {person.deceased ? 'เสียชีวิต' : 'ยังมีชีวิต'}
              </button>
              {person.deceased && (
                <input
                  data-testid="status-year-input"
                  type="number"
                  placeholder="ปีที่เสียชีวิต (ไม่ทราบ = ว่าง)"
                  defaultValue={person.died ?? ''}
                  style={{
                    width: '14rem',
                    padding: '0.5rem 0.7rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--line)',
                    background: 'var(--paper-2)',
                    color: 'var(--ink)',
                    fontFamily: '"Prompt", system-ui, sans-serif',
                    fontSize: '0.85rem',
                  }}
                  // Commit on blur / Enter (not per keystroke) so the owner path
                  // doesn't fire a PATCH for every digit (and persist invalid
                  // intermediate years like "1" that would 422-and-revert).
                  onBlur={(e) => {
                    const raw = e.target.value.trim();
                    const parsed = raw === '' ? null : parseInt(raw, 10);
                    const year = parsed !== null && !isNaN(parsed) ? parsed : null;
                    onSetStatus(person.id, true, year);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  }}
                />
              )}
              {!canEdit && (
                <span
                  data-testid="status-ephemeral-note"
                  style={{ fontSize: '0.78rem', color: 'var(--ink-faint)', fontStyle: 'italic' }}
                >
                  ทดลอง · ไม่บันทึก
                </span>
              )}
            </div>
          )}

          {onSetActiveView && (
            isActiveView ? (
              <span className="meta-chip">✓ กำลังดูจากมุมของคนนี้</span>
            ) : (
              <button
                data-testid="profile-pov-button"
                type="button"
                className="btn-secondary"
                onClick={() => onSetActiveView(person.id)}
                title="ดูจากมุมของคนนี้"
              >
                👁 ดูจากมุมของ {person.nick}
              </button>
            )
          )}

          {/* Owner edit / delete controls */}
          {(onUpdatePerson || onDeletePerson) && (
            <div style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
              {onUpdatePerson && !editMode && (
                <button
                  data-testid="edit-person-toggle"
                  type="button"
                  className="btn-secondary"
                  onClick={openEditMode}
                  style={{ fontSize: '0.85rem', borderRadius: 'var(--radius-pill)' }}
                >
                  แก้ไข
                </button>
              )}
              {onDeletePerson && !editMode && !deleteConfirm && (
                <button
                  data-testid="delete-person-button"
                  type="button"
                  onClick={() => setDeleteConfirm(true)}
                  style={{
                    padding: '0.35rem 0.7rem',
                    borderRadius: 'var(--radius-pill)',
                    border: '1px solid var(--danger-border)',
                    background: 'transparent',
                    color: 'var(--danger-ink)',
                    cursor: 'pointer',
                    fontFamily: '"Prompt", system-ui, sans-serif',
                    fontSize: '0.85rem',
                  }}
                >
                  ลบคนนี้
                </button>
              )}
              {onDeletePerson && deleteConfirm && !editMode && (
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--ink-soft)' }}>ยืนยันลบ?</span>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={handleDelete}
                    style={{
                      padding: '0.3rem 0.65rem',
                      borderRadius: 'var(--radius-sm)',
                      border: 'none',
                      background: 'var(--danger)',
                      color: '#fff',
                      cursor: deleting ? 'not-allowed' : 'pointer',
                      fontFamily: '"Prompt", system-ui, sans-serif',
                      fontSize: '0.82rem',
                      opacity: deleting ? 0.5 : 1,
                    }}
                  >
                    {deleting ? 'กำลังลบ…' : 'ยืนยัน'}
                  </button>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => setDeleteConfirm(false)}
                    style={{
                      padding: '0.3rem 0.65rem',
                      borderRadius: 'var(--radius-pill)',
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--ink-soft)',
                      cursor: 'pointer',
                      fontFamily: '"Prompt", system-ui, sans-serif',
                      fontSize: '0.82rem',
                    }}
                  >
                    ยกเลิก
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Edit mode form */}
          {editMode && onUpdatePerson && (
            <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'var(--paper-2)', borderRadius: 'var(--radius)', border: '1px solid var(--line)' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6rem' }}>
                แก้ไขข้อมูล
              </div>

              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '0.25rem' }}>
                ชื่อ
              </label>
              <input
                data-testid="edit-person-name"
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem 0.7rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)', fontFamily: '"Prompt", system-ui, sans-serif', fontSize: '0.9rem', background: 'var(--paper-2)', color: 'var(--ink)', marginBottom: '0.5rem' }}
              />

              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '0.25rem' }}>
                ชื่อเล่น
              </label>
              <input
                data-testid="edit-person-nick"
                type="text"
                value={editNick}
                onChange={(e) => setEditNick(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem 0.7rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)', fontFamily: '"Prompt", system-ui, sans-serif', fontSize: '0.9rem', background: 'var(--paper-2)', color: 'var(--ink)', marginBottom: '0.5rem' }}
              />

              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '0.25rem' }}>
                ปีเกิด
              </label>
              <input
                data-testid="edit-person-born"
                type="number"
                value={editBorn}
                onChange={(e) => setEditBorn(e.target.value)}
                placeholder="เช่น 1960"
                style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem 0.7rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)', fontFamily: '"Prompt", system-ui, sans-serif', fontSize: '0.9rem', background: 'var(--paper-2)', color: 'var(--ink)', marginBottom: '0.5rem' }}
              />

              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '0.25rem' }}>
                บ้านเกิด
              </label>
              <input
                data-testid="edit-person-hometown"
                type="text"
                value={editHometown}
                onChange={(e) => setEditHometown(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem 0.7rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)', fontFamily: '"Prompt", system-ui, sans-serif', fontSize: '0.9rem', background: 'var(--paper-2)', color: 'var(--ink)', marginBottom: '0.5rem' }}
              />

              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '0.25rem' }}>
                เพศ
              </label>
              <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.75rem' }}>
                <button
                  type="button"
                  data-testid="edit-person-gender-m"
                  onClick={() => setEditGender('m')}
                  style={{ flex: 1, padding: '0.35rem', borderRadius: 'var(--radius-pill)', border: `1px solid ${editGender === 'm' ? 'var(--leaf)' : 'var(--line)'}`, background: editGender === 'm' ? 'var(--leaf-soft)' : 'var(--paper)', color: editGender === 'm' ? 'var(--leaf-strong)' : 'var(--ink-soft)', cursor: 'pointer', fontFamily: '"Prompt", system-ui, sans-serif', fontSize: '0.85rem' }}
                >
                  ชาย
                </button>
                <button
                  type="button"
                  data-testid="edit-person-gender-f"
                  onClick={() => setEditGender('f')}
                  style={{ flex: 1, padding: '0.35rem', borderRadius: 'var(--radius-pill)', border: `1px solid ${editGender === 'f' ? 'var(--leaf)' : 'var(--line)'}`, background: editGender === 'f' ? 'var(--leaf-soft)' : 'var(--paper)', color: editGender === 'f' ? 'var(--leaf-strong)' : 'var(--ink-soft)', cursor: 'pointer', fontFamily: '"Prompt", system-ui, sans-serif', fontSize: '0.85rem' }}
                >
                  หญิง
                </button>
              </div>

              {editError && (
                <div role="alert" style={{ background: 'var(--danger-soft)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', padding: '0.45rem 0.6rem', fontSize: '0.82rem', color: 'var(--danger-ink)', marginBottom: '0.5rem' }}>
                  {editError}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={closeEditMode}
                  disabled={editSaving}
                  style={{ padding: '0.4rem 0.8rem', borderRadius: 'var(--radius-pill)', border: 'none', background: 'transparent', color: 'var(--ink-soft)', cursor: 'pointer', fontFamily: '"Prompt", system-ui, sans-serif', fontSize: '0.85rem' }}
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  data-testid="edit-person-save"
                  aria-live="polite"
                  onClick={handleEditSave}
                  disabled={editSaving || !editName.trim()}
                  style={{ padding: '0.4rem 0.9rem', borderRadius: 'var(--radius-pill)', border: 'none', background: 'var(--accent-grad)', color: '#fff', cursor: editSaving || !editName.trim() ? 'not-allowed' : 'pointer', opacity: editSaving || !editName.trim() ? 0.5 : 1, boxShadow: '0 4px 14px rgba(12,166,120,.3)', fontFamily: '"Prompt", system-ui, sans-serif', fontSize: '0.85rem', fontWeight: 600 }}
                >
                  {editSaving ? 'กำลังบันทึก…' : 'บันทึก'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lineage-link panel — for external people or those with no ancestors, but not "me" */}
      {(person.external || hasNoAncestors) && !person.isMe && (
        <div className="lineage-link">
          {lineage ? (
            <>
              <div className="lineage-link-head">
                <div>
                  <div className="ll-kicker">
                    ต้นสาย · {lineage.family}
                  </div>
                  <div className="ll-meta">
                    {lineage.members} คนในตระกูล · code{' '}
                    <span className="mono">{lineage.code}</span>
                  </div>
                </div>
                <span className={`ll-status ${lineage.linked ? 'linked' : ''}`}>
                  {lineage.linked ? 'เชื่อมแล้ว' : 'เฉพาะ preview'}
                </span>
              </div>
              <button
                className={`btn-primary full-width ${isExpanded ? 'is-on' : ''}`}
                onClick={() => onToggleLineage(person.id)}
              >
                {isExpanded ? '◢ ซ่อนต้นสายจาก tree' : '◣ เปิดต้นสายบน tree'}
              </button>
            </>
          ) : (
            <>
              <div className="lineage-link-head">
                <div>
                  <div className="ll-kicker">ต้นสายของ {person.nick}</div>
                  <div className="ll-meta">ยังไม่มีข้อมูลต้นสายฝั่งนี้</div>
                </div>
              </div>
              <div className="lineage-actions">
                <button className="btn-secondary">+ เริ่ม tree ฝั่งนี้เอง</button>
                <button className="btn-secondary">⇄ เชื่อมกับ tree ที่มีอยู่</button>
              </div>
              <div className="ll-hint">
                ถ้า {person.nick} หรือญาติฝั่งนั้นทำ tree ไว้แล้ว ใส่รหัส tree
                เพื่อเชื่อม · หรือเริ่มต้นจากศูนย์
              </div>
            </>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="profile-tabs">
        {/* Family tab — default open */}
        <Tab label="Family" count={familyCount} defaultOpen>
          <div className="relation-grid">
            {parents.length > 0 && (
              <div className="rel-section">
                <h4>พ่อแม่ · Parents</h4>
                <div className="rel-chips">
                  {parents.map(p => (
                    <button
                      key={p.id}
                      className="rel-chip"
                      onClick={() => onJumpTo(p.id)}
                    >
                      <span className="rel-dot" /> {p.nick}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {spouse && (
              <div className="rel-section">
                <h4>คู่ครอง · Partner</h4>
                <div className="rel-chips">
                  <button
                    className="rel-chip heart"
                    onClick={() => onJumpTo(spouse.id)}
                  >
                    <span className="rel-dot" /> {spouse.nick}
                  </button>
                </div>
              </div>
            )}
            {siblings.length > 0 && (
              <div className="rel-section">
                <h4>พี่น้อง · Siblings</h4>
                <div className="rel-chips">
                  {siblings.map(p => (
                    <button
                      key={p.id}
                      className="rel-chip"
                      onClick={() => onJumpTo(p.id)}
                    >
                      <span className="rel-dot" /> {p.nick}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {children.length > 0 && (
              <div className="rel-section">
                <h4>ลูก · Children</h4>
                <div className="rel-chips">
                  {children.map(p => (
                    <button
                      key={p.id}
                      className="rel-chip"
                      onClick={() => onJumpTo(p.id)}
                    >
                      <span className="rel-dot" /> {p.nick}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Tab>

        {/* Stories tab */}
        <Tab label="Stories" count={stories.length}>
          {stories.length === 0 ? (
            <div className="empty-state">
              <p>ยังไม่มีเรื่องเล่า</p>
              <button className="btn-secondary">+ เพิ่มเรื่องเล่า</button>
            </div>
          ) : (
            <div className="timeline">
              {stories.map((s, i) => (
                <div className="timeline-item" key={i}>
                  <div className="timeline-year">{s.year}</div>
                  <div className="timeline-dot" />
                  <div className="timeline-body">
                    <h5>{s.title}</h5>
                    <p>{s.body}</p>
                  </div>
                </div>
              ))}
              <button className="btn-secondary timeline-add">
                + เพิ่มอีกเรื่อง
              </button>
            </div>
          )}
        </Tab>

        {/* Photos tab */}
        <Tab label="Photos" count={photoCount}>
          {/* Hidden file input for photo upload */}
          <input
            ref={photoFileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            data-testid="photo-file-input"
            style={{ display: 'none' }}
            onChange={handlePhotoFileChange}
          />

          <div className="photo-grid">
            {photoItems.map((photo, i) => (
              <div
                key={photo.id}
                className="photo-tile"
                style={{ animationDelay: `${i * 40}ms`, position: 'relative' }}
              >
                <img
                  src={`/api/img/${photo.key}`}
                  alt=""
                  loading="lazy"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                  }}
                />
                {canEdit && onDeletePhoto && (
                  <button
                    type="button"
                    aria-label="ลบรูปนี้"
                    onClick={() => handleDeletePhoto(photo.id)}
                    style={{
                      position: 'absolute',
                      top: '4px',
                      right: '4px',
                      width: '22px',
                      height: '22px',
                      borderRadius: '50%',
                      border: 'none',
                      background: 'rgba(0,0,0,0.55)',
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: '12px',
                      lineHeight: '22px',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            {/* Fallback mock tiles when there are no real photos yet */}
            {photoItems.length === 0 && photoCount > 0 && Array.from({ length: Math.min(9, photoCount) }).map((_, i) => (
              <div
                key={i}
                className="photo-tile"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className="photo-tile-bg" />
                <div className="photo-tile-label">{1950 + ((i * 7) % 70)}</div>
              </div>
            ))}
            {photoItems.length === 0 && photoCount > 9 && (
              <div className="photo-tile more">+{photoCount - 9}</div>
            )}
          </div>

          {photoError && (
            <div data-testid="photo-error" role="alert" style={{ background: 'var(--danger-soft)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', padding: '0.45rem 0.6rem', fontSize: '0.82rem', color: 'var(--danger-ink)', marginBottom: '0.5rem' }}>
              {photoError}
            </div>
          )}

          {canEdit && onUploadPhoto ? (
            <button
              type="button"
              data-testid="photo-upload-button"
              className="btn-primary full-width"
              aria-live="polite"
              disabled={uploading}
              onClick={() => photoFileInputRef.current?.click()}
              style={{ opacity: uploading ? 0.55 : 1, cursor: uploading ? 'not-allowed' : 'pointer' }}
            >
              <span>↑</span> {uploading ? 'กำลังอัปโหลด…' : 'อัปโหลดรูปใหม่'}
            </button>
          ) : (
            <button className="btn-primary full-width" disabled>
              <span>↑</span> อัปโหลดรูปใหม่
            </button>
          )}
        </Tab>

        {/* Voice tab */}
        <Tab label="Voice" count={memos.length}>
          {memos.length === 0 ? (
            <div className="empty-state">
              <p>ยังไม่มีเสียงบันทึก</p>
              <button className="btn-secondary">🎙 บันทึกเสียง</button>
            </div>
          ) : (
            <div className="memo-list">
              {memos.map((m, i) => (
                <div className="memo-card" key={i}>
                  <button className="memo-play">▶</button>
                  <div className="memo-body">
                    <div className="memo-title">{m.title}</div>
                    <div className="memo-meta">
                      <span>
                        บันทึกโดย{' '}
                        {data.people.find(p => p.id === m.by)?.nick || 'unknown'}
                      </span>
                      <span>·</span>
                      <span>{m.date}</span>
                    </div>
                    <div className="memo-wave">
                      {Array.from({ length: 32 }).map((_, j) => (
                        <div
                          key={j}
                          className="wave-bar"
                          style={{
                            height: `${
                              20 +
                              Math.sin(j * 0.8 + i) * 14 +
                              Math.cos(j * 1.3) * 8
                            }px`,
                          }}
                        />
                      ))}
                    </div>
                    <div className="memo-duration">
                      {Math.floor(m.duration / 60)}:
                      {String(m.duration % 60).padStart(2, '0')}
                    </div>
                  </div>
                </div>
              ))}
              <button className="btn-secondary">🎙 เพิ่มเสียงบันทึก</button>
            </div>
          )}
        </Tab>
      </div>
    </aside>
  );
}
