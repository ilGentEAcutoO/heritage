/**
 * AddPersonDialog.tsx — modal to add a new person to the family tree.
 *
 * Mirrors the CreateTreeDialog modal style. Accepts an optional `relativeTo`
 * person; when provided, shows a relation selector so the new person can be
 * immediately connected to the reference person.
 *
 * Shell (overlay, focus-trap, ESC, entrance) comes from <Modal>; form styling
 * from the shared .field-* / .segmented / .btn-* classes.
 */

import { useState } from 'react';
import { apiClient } from '@app/lib/api';
import type { ApiError } from '@app/lib/api';
import type { Person } from '@app/lib/types';
import { Modal } from './Modal';

export interface AddPersonDialogProps {
  slug: string;
  /** If provided, shows a "เกี่ยวข้องกับ <nick> เป็น" relation picker. */
  relativeTo?: Person | null;
  onClose: () => void;
  onCreated: (person: Person) => void;
}

type RelationChoice = 'none' | 'child' | 'parent' | 'spouse';

export function AddPersonDialog({ slug, relativeTo, onClose, onCreated }: AddPersonDialogProps) {
  const [name, setName] = useState('');
  const [nick, setNick] = useState('');
  const [born, setBorn] = useState('');
  const [hometown, setHometown] = useState('');
  const [gender, setGender] = useState<'m' | 'f'>('m');
  const [relation, setRelation] = useState<RelationChoice>('none');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = name.trim().length > 0 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');

    try {
      const bornNum = born.trim() ? parseInt(born.trim(), 10) : undefined;

      const { person: newPersonRaw } = await apiClient.createPerson(slug, {
        name: name.trim(),
        nick: nick.trim() || undefined,
        born: bornNum !== undefined && !isNaN(bornNum) ? bornNum : null,
        hometown: hometown.trim() || undefined,
        gender,
      });

      // If a relation was chosen, create it
      if (relativeTo && relation !== 'none') {
        const relBody =
          relation === 'child'
            ? { fromId: newPersonRaw.id, toId: relativeTo.id, kind: 'parent' as const }
            : relation === 'parent'
            ? { fromId: relativeTo.id, toId: newPersonRaw.id, kind: 'parent' as const }
            : { fromId: newPersonRaw.id, toId: relativeTo.id, kind: 'spouse' as const };

        await apiClient.createRelation(slug, relBody);
      }

      // Build a minimal Person object for immediate use by the caller
      const newPerson: Person = {
        id: newPersonRaw.id,
        name: newPersonRaw.name,
        nameEn: newPersonRaw.nameEn ?? undefined,
        nick: newPersonRaw.nick ?? undefined,
        born: newPersonRaw.born,
        died: newPersonRaw.died,
        deceased: newPersonRaw.deceased,
        gender: newPersonRaw.gender,
        hometown: newPersonRaw.hometown ?? undefined,
        parents: [],
        isMe: false,
        external: false,
      };

      onCreated(newPerson);
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 409) setError('ความสัมพันธ์นี้มีอยู่แล้ว');
      else if (err.status === 422) {
        const errCode = (err as { error?: string }).error;
        if (errCode === 'cycle') setError('ไม่สามารถสร้างความสัมพันธ์ที่เป็นวงกลมได้');
        else if (errCode === 'self_relation') setError('ไม่สามารถเชื่อมคนกับตัวเองได้');
        else setError('ข้อมูลไม่ถูกต้อง — ตรวจสอบปีเกิด/ปีเสียชีวิต');
      } else if (err.status === 401) setError('กรุณาเข้าสู่ระบบใหม่');
      else setError('เพิ่มคนไม่สำเร็จ — ลองใหม่อีกครั้ง');
      setSubmitting(false);
    }
  }

  return (
    <Modal onClose={onClose} busy={submitting} labelledBy="ap-title" size="md" testId="add-person-dialog">
      <h2 className="modal-title" id="ap-title">เพิ่มคนในตระกูล</h2>

      {/* Name (required) */}
      <label className="field-label" htmlFor="ap-name">
        ชื่อ <span style={{ color: 'var(--danger-ink, #991b1b)' }}>*</span>
      </label>
      <input
        id="ap-name"
        data-testid="add-person-name"
        className="field-input"
        value={name}
        autoFocus
        placeholder="เช่น สมชาย วงศ์สุริยา"
        onChange={(e) => setName(e.target.value)}
      />

      {/* Nick */}
      <label className="field-label" htmlFor="ap-nick">
        ชื่อเล่น
      </label>
      <input
        id="ap-nick"
        data-testid="add-person-nick"
        className="field-input"
        value={nick}
        placeholder="เช่น ชาย"
        onChange={(e) => setNick(e.target.value)}
      />

      {/* Born */}
      <label className="field-label" htmlFor="ap-born">
        ปีเกิด
      </label>
      <input
        id="ap-born"
        data-testid="add-person-born"
        className="field-input"
        type="number"
        inputMode="numeric"
        value={born}
        placeholder="เช่น 1960"
        onChange={(e) => setBorn(e.target.value)}
      />

      {/* Hometown */}
      <label className="field-label" htmlFor="ap-hometown">
        บ้านเกิด
      </label>
      <input
        id="ap-hometown"
        data-testid="add-person-hometown"
        className="field-input"
        value={hometown}
        placeholder="เช่น เชียงใหม่"
        onChange={(e) => setHometown(e.target.value)}
      />

      {/* Gender */}
      <label className="field-label">เพศ</label>
      <div className="segmented" role="group" aria-label="เพศ">
        <button
          type="button"
          data-testid="add-person-gender-m"
          className="segmented-btn"
          aria-pressed={gender === 'm'}
          onClick={() => setGender('m')}
        >
          ชาย
        </button>
        <button
          type="button"
          data-testid="add-person-gender-f"
          className="segmented-btn"
          aria-pressed={gender === 'f'}
          onClick={() => setGender('f')}
        >
          หญิง
        </button>
      </div>

      {/* Relation to relativeTo (optional) */}
      {relativeTo && (
        <div style={{ borderTop: '1px solid var(--line)', margin: '1rem 0 0', paddingTop: '0.75rem' }}>
          <div
            style={{
              fontSize: '0.8rem',
              fontWeight: 600,
              color: 'var(--ink-faint)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '0.5rem',
            }}
          >
            ความสัมพันธ์
          </div>
          <label className="field-label" htmlFor="ap-relation">
            เกี่ยวข้องกับ {relativeTo.nick || relativeTo.name} เป็น
          </label>
          <select
            id="ap-relation"
            data-testid="add-person-relation"
            className="field-input"
            value={relation}
            onChange={(e) => setRelation(e.target.value as RelationChoice)}
          >
            <option value="none">ไม่ระบุ</option>
            <option value="child">ลูก (child)</option>
            <option value="parent">พ่อแม่ (parent)</option>
            <option value="spouse">คู่ครอง (spouse)</option>
          </select>
        </div>
      )}

      {error && (
        <div className="form-error" role="alert" data-testid="add-person-error">
          {error}
        </div>
      )}

      <div className="modal-actions">
        <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
          ยกเลิก
        </button>
        <button
          type="button"
          data-testid="add-person-submit"
          className="btn-primary"
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {submitting ? 'กำลังเพิ่ม…' : 'เพิ่มคน'}
        </button>
      </div>
    </Modal>
  );
}
