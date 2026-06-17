/**
 * CreateTreeDialog.tsx — modal to create a new family tree.
 *
 * Calls POST /api/trees (apiClient.createTree). The slug is auto-suggested from
 * the name (slugify) until the user edits it manually, then validated live
 * against the same regex the server enforces. On success, hands the new tree to
 * onCreated (the parent navigates to it).
 *
 * Shell (overlay, focus-trap, ESC, entrance) comes from <Modal>; form styling
 * from the shared .field-* / .segmented / .btn-* classes.
 */

import { useState } from 'react';
import { apiClient } from '@app/lib/api';
import type { ApiError, TreeSummary } from '@app/lib/api';
import { slugify, isValidSlug } from '@app/lib/slug';
import { Modal } from './Modal';

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

export function CreateTreeDialog({ onClose, onCreated }: CreateTreeDialogProps) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function handleName(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  const slugOk = isValidSlug(slug);
  const canSubmit = name.trim().length > 0 && slugOk && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
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
    }
  }

  return (
    <Modal onClose={onClose} busy={submitting} labelledBy="ct-title" size="md" testId="create-tree-dialog">
      <h2 className="modal-title" id="ct-title">สร้างต้นไม้ครอบครัวใหม่</h2>

      <label className="field-label" htmlFor="ct-name">ชื่อครอบครัว</label>
      <input
        id="ct-name"
        data-testid="create-tree-name"
        className="field-input"
        value={name}
        placeholder="เช่น บ้านวงศ์สุริยา"
        onChange={(e) => handleName(e.target.value)}
      />

      <label className="field-label" htmlFor="ct-slug">slug (สำหรับลิงก์)</label>
      <input
        id="ct-slug"
        data-testid="create-tree-slug"
        className="field-input"
        value={slug}
        placeholder="เช่น wongsuriya"
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => {
          setSlug(e.target.value.toLowerCase());
          setSlugTouched(true);
        }}
      />
      <div className="field-hint">
        {slug.length === 0
          ? 'a-z, 0-9, ขีดกลาง (-) · 2–64 ตัว'
          : slugOk
          ? `ลิงก์: /tree/${slug}`
          : 'รูปแบบไม่ถูกต้อง (a-z, 0-9, - · ขึ้นต้นด้วยตัวอักษร/ตัวเลข · 2–64 ตัว)'}
      </div>

      <label className="field-label">การมองเห็น</label>
      <div className="segmented" role="group" aria-label="การมองเห็น">
        {VIS_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            data-testid={`create-tree-vis-${o.value}`}
            className="segmented-btn"
            aria-pressed={visibility === o.value}
            onClick={() => setVisibility(o.value)}
            title={o.hint}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="field-hint">{VIS_OPTIONS.find((o) => o.value === visibility)?.hint}</div>

      {error && <div className="form-error" role="alert" data-testid="create-tree-error">{error}</div>}

      <div className="modal-actions">
        <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
          ยกเลิก
        </button>
        <button
          type="button"
          data-testid="create-tree-submit"
          className="btn-primary"
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {submitting ? 'กำลังสร้าง…' : 'สร้างต้นไม้'}
        </button>
      </div>
    </Modal>
  );
}
