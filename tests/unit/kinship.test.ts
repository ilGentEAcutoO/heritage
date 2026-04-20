/**
 * kinship.test.ts — TDD tests for computeRelation + findPath
 *
 * POV map (Wongsuriya fixture):
 *   p12 = นภา (Napa, isMe)
 *   p7  = อรุณ (Arun, Napa's father)
 *   p8  = ดาริน (Darin, Napa's mother) — parents: [k3, k4]
 *   p3  = สมชาย (Somchai, paternal grandpa)
 *   p4  = วิภา (Wipa, paternal grandma)
 *   k3  = ดำรง (Damrong, maternal grandpa)
 *   k4  = พิมพ์ (Pim, maternal grandma)
 *   p1  = ก้าน (Kan, great-grandpa)
 *   p2  = มาลี (Malee, great-grandma)
 *   p5  = ประยุทธ (Prayuth, grandpa's brother → ปู่ใหญ่)
 *   p9  = อรวรรณ (Orawan, Arun's younger sister → อา from Napa's POV)
 *   p13 = ภูมิ (Phum, Napa's younger brother)
 *   p14 = กานต์ (Kan, Orawan's son — cousin)
 *   p15 = แพรว (Praew, Orawan's daughter — cousin)
 */

import { describe, test, expect } from 'vitest';
import { computeRelation, findPath } from '@app/lib/kinship';
import { wongsuriya } from '../fixtures/wongsuriya';

const people = wongsuriya.people;

// Shorthand
const rel = (viewerId: string, otherId: string) =>
  computeRelation(people, viewerId, otherId);

// ============================================================================
describe('computeRelation — Wongsuriya family', () => {
  // ── Self ────────────────────────────────────────────────────────────────
  test('SELF: napa → napa = ฉัน', () => {
    expect(rel('p12', 'p12')).toBe('ฉัน');
  });

  // ── Direct ancestors (parents) ───────────────────────────────────────────
  test('napa → arun (father) = พ่ออรุณ', () => {
    expect(rel('p12', 'p7')).toBe('พ่ออรุณ');
  });

  test('napa → darin (mother) = แม่ดาริน', () => {
    expect(rel('p12', 'p8')).toBe('แม่ดาริน');
  });

  // ── Direct ancestors (paternal grandparents) ─────────────────────────────
  test('napa → somchai (paternal grandpa) = ปู่สมชาย', () => {
    expect(rel('p12', 'p3')).toBe('ปู่สมชาย');
  });

  test('napa → wipa (paternal grandma) = ย่าวิภา', () => {
    expect(rel('p12', 'p4')).toBe('ย่าวิภา');
  });

  // ── Direct ancestors (maternal grandparents — via Kaewsai expansion) ─────
  test('napa → damrong (maternal grandpa) = ตาดำรง', () => {
    expect(rel('p12', 'k3')).toBe('ตาดำรง');
  });

  test('napa → pim (maternal grandma) = ยายพิมพ์', () => {
    expect(rel('p12', 'k4')).toBe('ยายพิมพ์');
  });

  // ── Direct ancestors (great-grandparents) ───────────────────────────────
  test('napa → kan (paternal great-grandpa) = ปู่ทวดก้าน', () => {
    expect(rel('p12', 'p1')).toBe('ปู่ทวดก้าน');
  });

  test('napa → malee (paternal great-grandma) = ย่าทวดมาลี', () => {
    expect(rel('p12', 'p2')).toBe('ย่าทวดมาลี');
  });

  // ── Siblings ─────────────────────────────────────────────────────────────
  test('napa → phum (younger sibling) = น้องภูมิ', () => {
    expect(rel('p12', 'p13')).toBe('น้องภูมิ');
  });

  test('phum → napa (older sibling) = พี่นภา', () => {
    expect(rel('p13', 'p12')).toBe('พี่นภา');
  });

  // ── Aunt / uncle (paternal side) ─────────────────────────────────────────
  // Orawan (p9) born 1974, Arun (p7) born 1972 → Orawan younger than Arun
  // paternal side (father's younger sister) → อา
  test('napa → orawan (father\'s younger sister) = อาอรวรรณ', () => {
    expect(rel('p12', 'p9')).toBe('อาอรวรรณ');
  });

  // Arun's perspective: Orawan is his sister (น้อง, not อา)
  test('arun → orawan (sibling) = น้องอรวรรณ', () => {
    expect(rel('p7', 'p9')).toBe('น้องอรวรรณ');
  });

  // Prayuth (p5) — grandpa's brother (sibling of Somchai p3)
  // gen=2 from Napa, side='m' (paternal) → ปู่ใหญ่
  test('napa → prayuth (grandfather\'s brother) = ปู่ใหญ่ประยุทธ', () => {
    expect(rel('p12', 'p5')).toBe('ปู่ใหญ่ประยุทธ');
  });

  // ── Descendants ──────────────────────────────────────────────────────────
  test('arun → napa (daughter) = ลูกสาวนภา', () => {
    expect(rel('p7', 'p12')).toBe('ลูกสาวนภา');
  });

  test('arun → phum (son) = ลูกชายภูมิ', () => {
    expect(rel('p7', 'p13')).toBe('ลูกชายภูมิ');
  });

  test('somchai → napa (grandchild) = หลานนภา', () => {
    expect(rel('p3', 'p12')).toBe('หลานนภา');
  });

  test('kan (p1) → napa (great-grandchild) = เหลนนภา', () => {
    expect(rel('p1', 'p12')).toBe('เหลนนภา');
  });

  // ── Cousins ──────────────────────────────────────────────────────────────
  // p14 = Kan Pongpaisarn (Orawan's son) — first cousin of Napa
  test('napa → kan_pongpaisarn (p14) = ลูกพี่ลูกน้อง กานต์', () => {
    expect(rel('p12', 'p14')).toBe('ลูกพี่ลูกน้อง กานต์');
  });

  // p15 = Praew Pongpaisarn (Orawan's daughter)
  test('napa → praew (p15) = ลูกพี่ลูกน้อง แพรว', () => {
    expect(rel('p12', 'p15')).toBe('ลูกพี่ลูกน้อง แพรว');
  });

  // ── Spouse ───────────────────────────────────────────────────────────────
  test('somchai → wipa (wife) = ภรรยาวิภา', () => {
    expect(rel('p3', 'p4')).toBe('ภรรยาวิภา');
  });

  test('wipa → somchai (husband) = สามีสมชาย', () => {
    expect(rel('p4', 'p3')).toBe('สามีสมชาย');
  });

  // ── POV dynamism — same target, different viewers ─────────────────────────
  test('POV napa → somchai = ปู่สมชาย (paternal grandpa)', () => {
    expect(rel('p12', 'p3')).toBe('ปู่สมชาย');
  });

  test('POV arun → somchai = พ่อสมชาย (father)', () => {
    expect(rel('p7', 'p3')).toBe('พ่อสมชาย');
  });

  test('POV orawan → somchai = พ่อสมชาย (same, father)', () => {
    expect(rel('p9', 'p3')).toBe('พ่อสมชาย');
  });

  test('POV phum → somchai = ปู่สมชาย (same as napa)', () => {
    expect(rel('p13', 'p3')).toBe('ปู่สมชาย');
  });

  // ── Unrelated (unknown id) ────────────────────────────────────────────────
  test('napa → unknown_id returns null', () => {
    expect(rel('p12', 'NONEXISTENT')).toBeNull();
  });
});

// ============================================================================
describe('findPath — Wongsuriya family', () => {
  test('same person returns single-element path', () => {
    const path = findPath(people, 'p12', 'p12');
    expect(path).toEqual(['p12']);
  });

  test('parent-child path (napa to arun)', () => {
    const path = findPath(people, 'p12', 'p7');
    expect(path).not.toBeNull();
    expect(path![0]).toBe('p12');
    expect(path![path!.length - 1]).toBe('p7');
  });

  test('grandparent path (napa to somchai)', () => {
    const path = findPath(people, 'p12', 'p3');
    expect(path).not.toBeNull();
    expect(path!.length).toBe(3); // p12 → p7 → p3
  });

  test('spouse path (somchai to wipa)', () => {
    const path = findPath(people, 'p3', 'p4');
    expect(path).not.toBeNull();
    expect(path!.length).toBe(2);
  });

  test('path to unknown id returns null', () => {
    expect(findPath(people, 'p12', 'NONEXISTENT')).toBeNull();
  });

  test('path between cousins exists', () => {
    const path = findPath(people, 'p12', 'p14');
    expect(path).not.toBeNull();
    // Should go through shared ancestry: napa→arun→somchai→orawan→kan OR via spouse edges
  });

  test('null fromId returns null', () => {
    expect(findPath(people, '', 'p12')).toBeNull();
  });
});
