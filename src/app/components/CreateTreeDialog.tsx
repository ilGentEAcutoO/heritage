/**
 * CreateTreeDialog.tsx — modal to create a new family tree.
 *
 * Calls POST /api/trees (apiClient.createTree). The slug is auto-suggested from
 * the name (slugify) until the user edits it manually, then validated live
 * against the same regex the server enforces. On success, hands the new tree to
 * onCreated (the parent navigates to it).
 */

import { useState, useEffect, useRef } from 'react';
import { apiClient } from '@app/lib/api';
import type { ApiError, TreeSummary } from '@app/lib/api';
import { slugify, isValidSlug } from '@app/lib/slug';

export interface CreateTreeDialogProps {
  onClose: () => void;
  onCreated: (tree: TreeSummary) => void;
}

type Visibility = 'private' | 'shared' | 'public';

const VIS_OPTIONS: Array<{ value: Visibility; label: string; hint: string }> = [
  { value: 'private', label: 'ส่วนตัว', hint: 'เฉพาะคุณเท่านั้น' },
  { value: 'shared', label: 'แชร์', hint: 'คุณ + คนที่คุณเชิญ' },
  { value: 'public', label: 'สาธารณะ', hint: 'ใครก็ดูได้ด้วยลิงก์' },
];

const s = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(20,14,8,0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
    padding: '1rem',
  },
  panel: {
    width: '100%',
    maxWidth: '420px',
    background: 'var(--paper, #fff)',
    color: 'var(--ink, #2a1f14)',
    borderRadius: '10px',
    boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
    padding: '1.5rem',
    fontFamily: 'Sarabun, serif',
  },
  title: {
    fontFamily: 'Cormorant Garamond, serif',
    fontSize: '1.5rem',
    fontWeight: 600 as const,
    margin: '0 0 1rem',
  },
  label: { display: 'block', fontSize: '0.8rem', fontWeight: 600 as const, opacity: 0.7, margin: '0.85rem 0 0.3rem' },
  input: {
    width: '100%',
    boxSizing: 'border-box' as const,
    padding: '0.55rem 0.7rem',
    borderRadius: '6px',
    border: '1px solid var(--line, #ddd)',
    fontFamily: 'Sarabun, serif',
    fontSize: '0.95rem',
    background: 'var(--bg, #faf8f4)',
    color: 'var(--ink, #2a1f14)',
  },
  hint: { fontSize: '0.75rem', opacity: 0.55, marginTop: '0.25rem' },
  visRow: { display: 'flex', gap: '0.5rem', marginTop: '0.3rem' },
  visBtn: (active: boolean) => ({
    flex: 1,
    padding: '0.5rem 0.4rem',
    borderRadius: '6px',
    border: `1px solid ${active ? 'var(--leaf, #6b8f5e)' : 'var(--line, #ddd)'}`,
    background: active ? 'var(--leaf, #6b8f5e)' : 'transparent',
    color: active ? '#fff' : 'var(--ink, #2a1f14)',
    cursor: 'pointer',
    fontFamily: 'Sarabun, serif',
    fontSize: '0.85rem',
    textAlign: 'center' as const,
  }),
  error: {
    background: '#fef2f2',
    border: '1px solid #fca5a5',
    borderRadius: '5px',
    padding: '0.55rem 0.7rem',
    fontSize: '0.85rem',
    color: '#991b1b',
    margin: '0.85rem 0 0',
  },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '1.25rem' },
  cancel: {
    padding: '0.55rem 1rem',
    borderRadius: '6px',
    border: 'none',
    background: 'transparent',
    color: 'var(--ink, #2a1f14)',
    cursor: 'pointer',
    fontFamily: 'Sarabun, serif',
    fontSize: '0.9rem',
    opacity: 0.7,
  },
  submit: (enabled: boolean) => ({
    padding: '0.55rem 1.2rem',
    borderRadius: '6px',
    border: 'none',
    background: 'var(--leaf, #6b8f5e)',
    color: '#fff',
    cursor: enabled ? 'pointer' : 'not-allowed',
    opacity: enabled ? 1 : 0.45,
    fontFamily: 'Sarabun, serif',
    fontSize: '0.9rem',
    fontWeight: 500 as const,
  }),
};

export function CreateTreeDialog({ onClose, onCreated }: CreateTreeDialogProps) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const submittingRef = useRef(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !submittingRef.current) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handleName(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  const slugOk = isValidSlug(slug);
  const canSubmit = name.trim().length > 0 && slugOk && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    submittingRef.current = true;
    setError('');
    try {
      const { tree } = await apiClient.createTree({ name: name.trim(), slug, visibility });
      onCreated(tree);
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 409) setError('slug นี้ถูกใช้แล้ว — ลองใช้ชื่ออื่น');
      else if (err.status === 422) setError('ข้อมูลไม่ถูกต้อง — ตรวจสอบชื่อและ slug');
      else if (err.status === 401) setError('กรุณาเข้าสู่ระบบใหม่');
      else if (err.status === 429 || err.error === 'tree_limit_reached')
        setError(`สร้างได้สูงสุด ${err.max ?? 20} ครอบครัว — ลบครอบครัวเก่าออกก่อนจึงจะสร้างใหม่ได้`);
      else setError('สร้างไม่สำเร็จ — ลองใหม่อีกครั้ง');
      setSubmitting(false);
      submittingRef.current = false;
    }
  }

  return (
    <div
      style={s.overlay}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div style={s.panel} data-testid="create-tree-dialog" role="dialog" aria-modal="true" aria-label="สร้างต้นไม้ใหม่">
        <h2 style={s.title}>สร้างต้นไม้ครอบครัวใหม่</h2>

        <label style={s.label} htmlFor="ct-name">ชื่อครอบครัว</label>
        <input
          id="ct-name"
          data-testid="create-tree-name"
          style={s.input}
          value={name}
          autoFocus
          placeholder="เช่น บ้านวงศ์สุริยา"
          onChange={(e) => handleName(e.target.value)}
        />

        <label style={s.label} htmlFor="ct-slug">slug (สำหรับลิงก์)</label>
        <input
          id="ct-slug"
          data-testid="create-tree-slug"
          style={s.input}
          value={slug}
          placeholder="เช่น wongsuriya"
          onChange={(e) => {
            setSlug(e.target.value.toLowerCase());
            setSlugTouched(true);
          }}
        />
        <div style={s.hint}>
          {slug.length === 0
            ? 'a-z, 0-9, ขีดกลาง (-) · 2–64 ตัว'
            : slugOk
            ? `ลิงก์: /tree/${slug}`
            : 'รูปแบบไม่ถูกต้อง (a-z, 0-9, - · ขึ้นต้นด้วยตัวอักษร/ตัวเลข · 2–64 ตัว)'}
        </div>

        <label style={s.label}>การมองเห็น</label>
        <div style={s.visRow}>
          {VIS_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              data-testid={`create-tree-vis-${o.value}`}
              style={s.visBtn(visibility === o.value)}
              onClick={() => setVisibility(o.value)}
              title={o.hint}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div style={s.hint}>{VIS_OPTIONS.find((o) => o.value === visibility)?.hint}</div>

        {error && <div style={s.error} data-testid="create-tree-error">{error}</div>}

        <div style={s.actions}>
          <button type="button" style={s.cancel} onClick={onClose} disabled={submitting}>
            ยกเลิก
          </button>
          <button
            type="button"
            data-testid="create-tree-submit"
            style={s.submit(canSubmit)}
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {submitting ? 'กำลังสร้าง…' : 'สร้างต้นไม้'}
          </button>
        </div>
      </div>
    </div>
  );
}
