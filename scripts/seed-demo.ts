#!/usr/bin/env tsx
/**
 * CLI seed script — Wongsuriya demo data
 *
 * Usage:
 *   pnpm db:seed:local          # uses --local (default)
 *   tsx scripts/seed-demo.ts --remote   # uses --remote
 *
 * Strategy: generates drizzle/seed.sql then runs
 *   wrangler d1 execute heritage-d1-main [--local|--remote] --file=drizzle/seed.sql
 */

import { execFileSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const isRemote = process.argv.includes('--remote');
const flag = isRemote ? '--remote' : '--local';

const DB_NAME = 'heritage-d1-main';
const TREE_ID = 'tree-wongsuriya';
const TREE_SLUG = 'wongsuriya';

// ---------------------------------------------------------------------------
// Escape SQL string value
// ---------------------------------------------------------------------------
function esc(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  // Escape single quotes
  return `'${String(val).replace(/'/g, "''")}'`;
}

// ---------------------------------------------------------------------------
// Raw demo data (mirrored from src/worker/lib/seed.ts)
// ---------------------------------------------------------------------------

const PEOPLE = [
  { id: 'p1',  name: 'ก้าน วงศ์สุริยา',     name_en: 'Kan Wongsuriya',      nick: 'ก้าน',    born: 1918, died: 1994, gender: 'm', hometown: 'อยุธยา',    is_me: 0, external: 0 },
  { id: 'p2',  name: 'มาลี วงศ์สุริยา',     name_en: 'Malee Wongsuriya',    nick: 'มาลี',   born: 1922, died: 2001, gender: 'f', hometown: 'อยุธยา',    is_me: 0, external: 0 },
  { id: 'p3',  name: 'สมชาย วงศ์สุริยา',   name_en: 'Somchai Wongsuriya',  nick: 'สมชาย',  born: 1945, died: 2018, gender: 'm', hometown: 'กรุงเทพ',   is_me: 0, external: 0 },
  { id: 'p4',  name: 'วิภา วงศ์สุริยา',     name_en: 'Wipa Wongsuriya',     nick: 'วิภา',   born: 1948, died: null, gender: 'f', hometown: 'เชียงใหม่', is_me: 0, external: 1 },
  { id: 'p5',  name: 'ประยุทธ วงศ์สุริยา', name_en: 'Prayuth Wongsuriya',  nick: 'ประยุทธ', born: 1947, died: null, gender: 'm', hometown: 'กรุงเทพ',   is_me: 0, external: 0 },
  { id: 'p6',  name: 'ประนอม ใจดี',        name_en: 'Pranom Jaidee',       nick: 'ประนอม', born: 1950, died: null, gender: 'f', hometown: 'นครปฐม',   is_me: 0, external: 1 },
  { id: 'p7',  name: 'อรุณ วงศ์สุริยา',     name_en: 'Arun Wongsuriya',     nick: 'อรุณ',   born: 1972, died: null, gender: 'm', hometown: 'กรุงเทพ',   is_me: 0, external: 0 },
  { id: 'p8',  name: 'ดาริน แก้วใส',        name_en: 'Darin Kaewsai',       nick: 'ดาริน',  born: 1975, died: null, gender: 'f', hometown: 'ขอนแก่น',  is_me: 0, external: 1 },
  { id: 'p9',  name: 'อรวรรณ วงศ์สุริยา',  name_en: 'Orawan Wongsuriya',   nick: 'อรวรรณ', born: 1974, died: null, gender: 'f', hometown: 'กรุงเทพ',   is_me: 0, external: 0 },
  { id: 'p10', name: 'ธนา พงษ์ไพศาล',      name_en: 'Thana Pongpaisarn',   nick: 'ธนา',    born: 1971, died: null, gender: 'm', hometown: 'ระยอง',     is_me: 0, external: 1 },
  { id: 'p11', name: 'ไพโรจน์ วงศ์สุริยา', name_en: 'Pairot Wongsuriya',   nick: 'ไพโรจน์', born: 1976, died: null, gender: 'm', hometown: 'ภูเก็ต',   is_me: 0, external: 0 },
  { id: 'p12', name: 'นภา วงศ์สุริยา',      name_en: 'Napa Wongsuriya',     nick: 'นภา',    born: 2001, died: null, gender: 'f', hometown: 'กรุงเทพ',   is_me: 1, external: 0 },
  { id: 'p13', name: 'ภูมิ วงศ์สุริยา',     name_en: 'Phum Wongsuriya',     nick: 'ภูมิ',   born: 2005, died: null, gender: 'm', hometown: 'กรุงเทพ',   is_me: 0, external: 0 },
  { id: 'p14', name: 'กานต์ พงษ์ไพศาล',    name_en: 'Kan Pongpaisarn',     nick: 'กานต์',  born: 1998, died: null, gender: 'm', hometown: 'กรุงเทพ',   is_me: 0, external: 0 },
  { id: 'p15', name: 'แพรว พงษ์ไพศาล',     name_en: 'Praew Pongpaisarn',   nick: 'แพรว',   born: 2000, died: null, gender: 'f', hometown: 'ระยอง',     is_me: 0, external: 0 },
  { id: 'p16', name: 'ติณณ์ วงศ์สุริยา',   name_en: 'Tin Wongsuriya',      nick: 'ติณณ์',  born: 2008, died: null, gender: 'm', hometown: 'ภูเก็ต',   is_me: 0, external: 0 },
];

const RELATIONS = [
  { from_id: 'p2',  to_id: 'p1',  kind: 'spouse' },
  { from_id: 'p3',  to_id: 'p1',  kind: 'parent' },
  { from_id: 'p3',  to_id: 'p2',  kind: 'parent' },
  { from_id: 'p4',  to_id: 'p3',  kind: 'spouse' },
  { from_id: 'p5',  to_id: 'p1',  kind: 'parent' },
  { from_id: 'p5',  to_id: 'p2',  kind: 'parent' },
  { from_id: 'p6',  to_id: 'p5',  kind: 'spouse' },
  { from_id: 'p7',  to_id: 'p3',  kind: 'parent' },
  { from_id: 'p7',  to_id: 'p4',  kind: 'parent' },
  { from_id: 'p8',  to_id: 'p7',  kind: 'spouse' },
  { from_id: 'p9',  to_id: 'p3',  kind: 'parent' },
  { from_id: 'p9',  to_id: 'p4',  kind: 'parent' },
  { from_id: 'p10', to_id: 'p9',  kind: 'spouse' },
  { from_id: 'p11', to_id: 'p5',  kind: 'parent' },
  { from_id: 'p11', to_id: 'p6',  kind: 'parent' },
  { from_id: 'p12', to_id: 'p7',  kind: 'parent' },
  { from_id: 'p12', to_id: 'p8',  kind: 'parent' },
  { from_id: 'p13', to_id: 'p7',  kind: 'parent' },
  { from_id: 'p13', to_id: 'p8',  kind: 'parent' },
  { from_id: 'p14', to_id: 'p9',  kind: 'parent' },
  { from_id: 'p14', to_id: 'p10', kind: 'parent' },
  { from_id: 'p15', to_id: 'p9',  kind: 'parent' },
  { from_id: 'p15', to_id: 'p10', kind: 'parent' },
  { from_id: 'p16', to_id: 'p11', kind: 'parent' },
];

const STORIES = [
  { id: 'story-p1-1',  person_id: 'p1',  year: 1946, title: 'แต่งงานกับมาลี',           body: 'พิธีจัดที่บ้านริมน้ำอยุธยา 3 วัน 3 คืน' },
  { id: 'story-p1-2',  person_id: 'p1',  year: 1953, title: 'เปิดร้านทองร้านแรก',       body: 'ชื่อร้าน "สุริยาทอง" ตลาดหัวรอ' },
  { id: 'story-p3-1',  person_id: 'p3',  year: 1968, title: 'ย้ายเข้ากรุงเทพ',           body: 'มาทำงานธนาคารที่สำนักงานใหญ่' },
  { id: 'story-p3-2',  person_id: 'p3',  year: 1971, title: 'พบวิภาบนรถไฟเหนือ',        body: 'เจอกันตอนนั่งไปเชียงใหม่' },
  { id: 'story-p7-1',  person_id: 'p7',  year: 1999, title: 'แต่งงานกับดาริน',           body: 'งานเล็กๆ ที่บ้านทวด' },
  { id: 'story-p7-2',  person_id: 'p7',  year: 2001, title: 'ลูกคนแรกเกิด — นภา',       body: 'คลอดที่โรงพยาบาลศิริราช' },
  { id: 'story-p12-1', person_id: 'p12', year: 2019, title: 'เริ่มทำ family tree นี้',   body: 'หลังคุยกับวิภาช่วงปีใหม่' },
  { id: 'story-p12-2', person_id: 'p12', year: 2024, title: 'เจอญาติสายไพโรจน์ที่ภูเก็ต', body: 'ไปเที่ยวแล้วทักทาย ได้ merge tree กัน' },
];

const MEMOS = [
  { id: 'memo-p4-1', person_id: 'p4', by_id: 'p12', duration: 47,  title: 'วิภาเล่าเรื่องตอนเด็ก',  recorded_on: '2024-12-24' },
  { id: 'memo-p3-1', person_id: 'p3', by_id: 'p7',  duration: 92,  title: 'อรุณเล่าเรื่องสมชาย',    recorded_on: '2019-05-02' },
  { id: 'memo-p1-1', person_id: 'p1', by_id: 'p3',  duration: 210, title: 'ก้านร้องเพลงกล่อม',      recorded_on: '1992-07-15' },
];

interface LineagePreview {
  id: string;
  nick: string;
  born: number;
  died: number | null;
  gender: string;
  spouseOf?: string;
  parents?: string[];
  isBridge?: boolean;
}

const LINEAGES: Array<{
  id: string;
  bridge_person_id: string;
  family: string;
  family_en: string;
  code: string;
  preview: LineagePreview[];
}> = [
  {
    id: 'lin-p4', bridge_person_id: 'p4',
    family: 'บ้านเชียงใหม่', family_en: 'Chiang Mai Lineage', code: 'CM-2K14-WPR',
    preview: [
      { id: 'w1', nick: 'บุญมี',  born: 1900, died: 1970, gender: 'm' },
      { id: 'w2', nick: 'เพ็ญ',   born: 1905, died: 1980, gender: 'f', spouseOf: 'w1' },
      { id: 'w3', nick: 'สุทิน',  born: 1925, died: 1998, gender: 'm', parents: ['w1','w2'] },
      { id: 'w4', nick: 'บัวลอย', born: 1928, died: 2015, gender: 'f', spouseOf: 'w3' },
      { id: 'p4', nick: 'วิภา',   born: 1948, died: null, gender: 'f', parents: ['w3','w4'], isBridge: true },
    ],
  },
  {
    id: 'lin-p6', bridge_person_id: 'p6',
    family: 'บ้านใจดี', family_en: 'Jaidee Family', code: 'JAIDEE-8K21-TR3E',
    preview: [
      { id: 'j1', nick: 'บุญส่ง',  born: 1898, died: 1972, gender: 'm' },
      { id: 'j2', nick: 'สุดใจ',   born: 1902, died: 1978, gender: 'f', spouseOf: 'j1' },
      { id: 'j3', nick: 'จรูญ',    born: 1924, died: 1998, gender: 'm', parents: ['j1','j2'] },
      { id: 'j4', nick: 'เฉลา',    born: 1928, died: 2010, gender: 'f', spouseOf: 'j3' },
      { id: 'p6', nick: 'ประนอม', born: 1950, died: null, gender: 'f', parents: ['j3','j4'], isBridge: true },
    ],
  },
  {
    id: 'lin-p8', bridge_person_id: 'p8',
    family: 'บ้านแก้วใส', family_en: 'Kaewsai Family', code: 'KAEWSAI-4N19-HM1',
    preview: [
      { id: 'k1', nick: 'แก้ว',   born: 1920, died: 1990, gender: 'm' },
      { id: 'k2', nick: 'ใส',     born: 1925, died: 2005, gender: 'f', spouseOf: 'k1' },
      { id: 'k3', nick: 'ดำรง',   born: 1948, died: null, gender: 'm', parents: ['k1','k2'] },
      { id: 'k4', nick: 'พิมพ์',  born: 1951, died: null, gender: 'f', spouseOf: 'k3' },
      { id: 'p8', nick: 'ดาริน',  born: 1975, died: null, gender: 'f', parents: ['k3','k4'], isBridge: true },
    ],
  },
  {
    id: 'lin-p10', bridge_person_id: 'p10',
    family: 'บ้านพงษ์ไพศาล', family_en: 'Pongpaisarn Family', code: 'PONG-XQ82-PL5R',
    preview: [
      { id: 'g1', nick: 'พงษ์',   born: 1895, died: 1968, gender: 'm' },
      { id: 'g2', nick: 'ไพศาล',  born: 1922, died: 2001, gender: 'm', parents: ['g1'] },
      { id: 'g3', nick: 'สมจิต',  born: 1926, died: 2012, gender: 'f', spouseOf: 'g2' },
      { id: 'p10', nick: 'ธนา',   born: 1971, died: null, gender: 'm', parents: ['g2','g3'], isBridge: true },
    ],
  },
];

// ---------------------------------------------------------------------------
// Build SQL
// ---------------------------------------------------------------------------

function buildSeedSql(): string {
  const lines: string[] = [
    '-- Heritage demo seed — Wongsuriya family',
    '-- Generated by scripts/seed-demo.ts',
    '',
    '-- Trees',
    `INSERT OR IGNORE INTO trees (id, slug, name, name_en, owner_id, is_public) VALUES` +
    ` (${esc(TREE_ID)}, ${esc(TREE_SLUG)}, ${esc('บ้านวงศ์สุริยา')}, ${esc('Wongsuriya Family')}, NULL, 1);`,
    '',
    '-- People',
  ];

  for (const p of PEOPLE) {
    lines.push(
      `INSERT OR IGNORE INTO people (id, tree_id, name, name_en, nick, born, died, gender, hometown, is_me, external, avatar_key) VALUES ` +
      `(${esc(p.id)}, ${esc(TREE_ID)}, ${esc(p.name)}, ${esc(p.name_en)}, ${esc(p.nick)}, ${esc(p.born)}, ${esc(p.died)}, ${esc(p.gender)}, ${esc(p.hometown)}, ${p.is_me}, ${p.external}, NULL);`,
    );
  }
  lines.push('');

  lines.push('-- Relations');
  for (const r of RELATIONS) {
    lines.push(
      `INSERT OR IGNORE INTO relations (tree_id, from_id, to_id, kind) VALUES ` +
      `(${esc(TREE_ID)}, ${esc(r.from_id)}, ${esc(r.to_id)}, ${esc(r.kind)});`,
    );
  }
  lines.push('');

  lines.push('-- Stories');
  for (const s of STORIES) {
    lines.push(
      `INSERT OR IGNORE INTO stories (id, person_id, year, title, body) VALUES ` +
      `(${esc(s.id)}, ${esc(s.person_id)}, ${s.year}, ${esc(s.title)}, ${esc(s.body)});`,
    );
  }
  lines.push('');

  lines.push('-- Memos');
  for (const m of MEMOS) {
    lines.push(
      `INSERT OR IGNORE INTO memos (id, person_id, by_id, duration, title, recorded_on, object_key) VALUES ` +
      `(${esc(m.id)}, ${esc(m.person_id)}, ${esc(m.by_id)}, ${m.duration}, ${esc(m.title)}, ${esc(m.recorded_on)}, NULL);`,
    );
  }
  lines.push('');

  lines.push('-- Lineages');
  for (const l of LINEAGES) {
    lines.push(
      `INSERT OR IGNORE INTO lineages (id, bridge_person_id, family, family_en, code, linked_tree_id) VALUES ` +
      `(${esc(l.id)}, ${esc(l.bridge_person_id)}, ${esc(l.family)}, ${esc(l.family_en)}, ${esc(l.code)}, NULL);`,
    );
  }
  lines.push('');

  lines.push('-- Lineage members');
  for (const l of LINEAGES) {
    l.preview.forEach((person, idx) => {
      const personJson = JSON.stringify(person).replace(/'/g, "''");
      lines.push(
        `INSERT OR IGNORE INTO lineage_members (id, lineage_id, person_data) VALUES ` +
        `(${esc(`lm-${l.id}-${idx}`)}, ${esc(l.id)}, '${personJson}');`,
      );
    });
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const projectRoot = new URL('..', import.meta.url).pathname;
const sqlPath = join(projectRoot, 'drizzle', 'seed.sql');

// Ensure drizzle dir exists
mkdirSync(join(projectRoot, 'drizzle'), { recursive: true });

const sql = buildSeedSql();
writeFileSync(sqlPath, sql, 'utf8');
console.log(`[seed] Written SQL to ${sqlPath}`);

// Use execFileSync with array args (no shell injection possible — all args are constants)
const args = ['d1', 'execute', DB_NAME, flag, `--file=${sqlPath}`];
console.log(`[seed] Running: pnpm wrangler ${args.join(' ')}`);

execFileSync('pnpm', ['wrangler', ...args], { stdio: 'inherit', cwd: projectRoot });
console.log('[seed] Done.');
