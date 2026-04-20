/**
 * Wongsuriya demo seed — idempotent.
 * Inserts the 16-person demo family tree if it doesn't already exist.
 * Uses db.batch() because D1 does not support interactive transactions.
 */

import { eq } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { DB } from '../../db/client';
import {
  trees,
  people,
  relations,
  stories,
  memos,
  lineages,
  lineage_members,
} from '../../db/schema';

// ---------------------------------------------------------------------------
// Raw demo data (translated from /tmp/design_bundle/family-tree/project/data.js)
// ---------------------------------------------------------------------------

const TREE_SLUG = 'wongsuriya';
const TREE_ID = 'tree-wongsuriya';

const PEOPLE_DATA = [
  // Gen 1 — great-grandparents
  { id: 'p1',  name: 'ก้าน วงศ์สุริยา',     name_en: 'Kan Wongsuriya',      nick: 'ก้าน',    born: 1918, died: 1994 as number | null, gender: 'm' as 'm' | 'f', hometown: 'อยุธยา',    is_me: false, external: false },
  { id: 'p2',  name: 'มาลี วงศ์สุริยา',     name_en: 'Malee Wongsuriya',    nick: 'มาลี',   born: 1922, died: 2001 as number | null, gender: 'f' as 'm' | 'f', hometown: 'อยุธยา',    is_me: false, external: false },
  // Gen 2 — grandparents
  { id: 'p3',  name: 'สมชาย วงศ์สุริยา',   name_en: 'Somchai Wongsuriya',  nick: 'สมชาย',  born: 1945, died: 2018 as number | null, gender: 'm' as 'm' | 'f', hometown: 'กรุงเทพ',   is_me: false, external: false },
  { id: 'p4',  name: 'วิภา วงศ์สุริยา',     name_en: 'Wipa Wongsuriya',     nick: 'วิภา',   born: 1948, died: null as number | null, gender: 'f' as 'm' | 'f', hometown: 'เชียงใหม่', is_me: false, external: true  },
  { id: 'p5',  name: 'ประยุทธ วงศ์สุริยา', name_en: 'Prayuth Wongsuriya',  nick: 'ประยุทธ', born: 1947, died: null as number | null, gender: 'm' as 'm' | 'f', hometown: 'กรุงเทพ',   is_me: false, external: false },
  { id: 'p6',  name: 'ประนอม ใจดี',        name_en: 'Pranom Jaidee',       nick: 'ประนอม', born: 1950, died: null as number | null, gender: 'f' as 'm' | 'f', hometown: 'นครปฐม',   is_me: false, external: true  },
  // Gen 3
  { id: 'p7',  name: 'อรุณ วงศ์สุริยา',     name_en: 'Arun Wongsuriya',     nick: 'อรุณ',   born: 1972, died: null as number | null, gender: 'm' as 'm' | 'f', hometown: 'กรุงเทพ',   is_me: false, external: false },
  { id: 'p8',  name: 'ดาริน แก้วใส',        name_en: 'Darin Kaewsai',       nick: 'ดาริน',  born: 1975, died: null as number | null, gender: 'f' as 'm' | 'f', hometown: 'ขอนแก่น',  is_me: false, external: true  },
  { id: 'p9',  name: 'อรวรรณ วงศ์สุริยา',  name_en: 'Orawan Wongsuriya',   nick: 'อรวรรณ', born: 1974, died: null as number | null, gender: 'f' as 'm' | 'f', hometown: 'กรุงเทพ',   is_me: false, external: false },
  { id: 'p10', name: 'ธนา พงษ์ไพศาล',      name_en: 'Thana Pongpaisarn',   nick: 'ธนา',    born: 1971, died: null as number | null, gender: 'm' as 'm' | 'f', hometown: 'ระยอง',     is_me: false, external: true  },
  { id: 'p11', name: 'ไพโรจน์ วงศ์สุริยา', name_en: 'Pairot Wongsuriya',   nick: 'ไพโรจน์', born: 1976, died: null as number | null, gender: 'm' as 'm' | 'f', hometown: 'ภูเก็ต',   is_me: false, external: false },
  // Gen 4
  { id: 'p12', name: 'นภา วงศ์สุริยา',      name_en: 'Napa Wongsuriya',     nick: 'นภา',    born: 2001, died: null as number | null, gender: 'f' as 'm' | 'f', hometown: 'กรุงเทพ',   is_me: true,  external: false },
  { id: 'p13', name: 'ภูมิ วงศ์สุริยา',     name_en: 'Phum Wongsuriya',     nick: 'ภูมิ',   born: 2005, died: null as number | null, gender: 'm' as 'm' | 'f', hometown: 'กรุงเทพ',   is_me: false, external: false },
  { id: 'p14', name: 'กานต์ พงษ์ไพศาล',    name_en: 'Kan Pongpaisarn',     nick: 'กานต์',  born: 1998, died: null as number | null, gender: 'm' as 'm' | 'f', hometown: 'กรุงเทพ',   is_me: false, external: false },
  { id: 'p15', name: 'แพรว พงษ์ไพศาล',     name_en: 'Praew Pongpaisarn',   nick: 'แพรว',   born: 2000, died: null as number | null, gender: 'f' as 'm' | 'f', hometown: 'ระยอง',     is_me: false, external: false },
  { id: 'p16', name: 'ติณณ์ วงศ์สุริยา',   name_en: 'Tin Wongsuriya',      nick: 'ติณณ์',  born: 2008, died: null as number | null, gender: 'm' as 'm' | 'f', hometown: 'ภูเก็ต',   is_me: false, external: false },
];

// Relations: child→parents (kind='parent'), spouse→partner (kind='spouse')
const RELATIONS_DATA: Array<{ from_id: string; to_id: string; kind: 'parent' | 'spouse' }> = [
  // p1 × p2 spouse
  { from_id: 'p2', to_id: 'p1', kind: 'spouse' },
  // p3 parents p1, p2
  { from_id: 'p3', to_id: 'p1', kind: 'parent' },
  { from_id: 'p3', to_id: 'p2', kind: 'parent' },
  // p4 spouse p3
  { from_id: 'p4', to_id: 'p3', kind: 'spouse' },
  // p5 parents p1, p2
  { from_id: 'p5', to_id: 'p1', kind: 'parent' },
  { from_id: 'p5', to_id: 'p2', kind: 'parent' },
  // p6 spouse p5
  { from_id: 'p6', to_id: 'p5', kind: 'spouse' },
  // p7 parents p3, p4
  { from_id: 'p7', to_id: 'p3', kind: 'parent' },
  { from_id: 'p7', to_id: 'p4', kind: 'parent' },
  // p8 spouse p7
  { from_id: 'p8', to_id: 'p7', kind: 'spouse' },
  // p9 parents p3, p4
  { from_id: 'p9', to_id: 'p3', kind: 'parent' },
  { from_id: 'p9', to_id: 'p4', kind: 'parent' },
  // p10 spouse p9
  { from_id: 'p10', to_id: 'p9', kind: 'spouse' },
  // p11 parents p5, p6
  { from_id: 'p11', to_id: 'p5', kind: 'parent' },
  { from_id: 'p11', to_id: 'p6', kind: 'parent' },
  // p12 parents p7, p8
  { from_id: 'p12', to_id: 'p7', kind: 'parent' },
  { from_id: 'p12', to_id: 'p8', kind: 'parent' },
  // p13 parents p7, p8
  { from_id: 'p13', to_id: 'p7', kind: 'parent' },
  { from_id: 'p13', to_id: 'p8', kind: 'parent' },
  // p14 parents p9, p10
  { from_id: 'p14', to_id: 'p9', kind: 'parent' },
  { from_id: 'p14', to_id: 'p10', kind: 'parent' },
  // p15 parents p9, p10
  { from_id: 'p15', to_id: 'p9', kind: 'parent' },
  { from_id: 'p15', to_id: 'p10', kind: 'parent' },
  // p16 parent p11 only
  { from_id: 'p16', to_id: 'p11', kind: 'parent' },
];

interface StoryRow {
  id: string;
  person_id: string;
  year: number;
  title: string;
  body: string;
}

const STORIES_DATA: StoryRow[] = [
  { id: 'story-p1-1',  person_id: 'p1',  year: 1946, title: 'แต่งงานกับมาลี',           body: 'พิธีจัดที่บ้านริมน้ำอยุธยา 3 วัน 3 คืน' },
  { id: 'story-p1-2',  person_id: 'p1',  year: 1953, title: 'เปิดร้านทองร้านแรก',       body: 'ชื่อร้าน "สุริยาทอง" ตลาดหัวรอ' },
  { id: 'story-p3-1',  person_id: 'p3',  year: 1968, title: 'ย้ายเข้ากรุงเทพ',           body: 'มาทำงานธนาคารที่สำนักงานใหญ่' },
  { id: 'story-p3-2',  person_id: 'p3',  year: 1971, title: 'พบวิภาบนรถไฟเหนือ',        body: 'เจอกันตอนนั่งไปเชียงใหม่' },
  { id: 'story-p7-1',  person_id: 'p7',  year: 1999, title: 'แต่งงานกับดาริน',           body: 'งานเล็กๆ ที่บ้านทวด' },
  { id: 'story-p7-2',  person_id: 'p7',  year: 2001, title: 'ลูกคนแรกเกิด — นภา',       body: 'คลอดที่โรงพยาบาลศิริราช' },
  { id: 'story-p12-1', person_id: 'p12', year: 2019, title: 'เริ่มทำ family tree นี้',   body: 'หลังคุยกับวิภาช่วงปีใหม่' },
  { id: 'story-p12-2', person_id: 'p12', year: 2024, title: 'เจอญาติสายไพโรจน์ที่ภูเก็ต', body: 'ไปเที่ยวแล้วทักทาย ได้ merge tree กัน' },
];

interface MemoRow {
  id: string;
  person_id: string;
  by_id: string;
  duration: number;
  title: string;
  recorded_on: string;
}

const MEMOS_DATA: MemoRow[] = [
  { id: 'memo-p4-1', person_id: 'p4', by_id: 'p12', duration: 47,  title: 'วิภาเล่าเรื่องตอนเด็ก',  recorded_on: '2024-12-24' },
  { id: 'memo-p3-1', person_id: 'p3', by_id: 'p7',  duration: 92,  title: 'อรุณเล่าเรื่องสมชาย',    recorded_on: '2019-05-02' },
  { id: 'memo-p1-1', person_id: 'p1', by_id: 'p3',  duration: 210, title: 'ก้านร้องเพลงกล่อม',      recorded_on: '1992-07-15' },
];

interface LineagePreviewPerson {
  id: string;
  nick: string;
  born: number;
  died: number | null;
  gender: string;
  spouseOf?: string;
  parents?: string[];
  isBridge?: boolean;
}

interface LineageEntry {
  id: string;
  bridge_person_id: string;
  family: string;
  family_en: string;
  code: string;
  linked_tree_id: string | null;
  preview: LineagePreviewPerson[];
}

const LINEAGES_DATA: LineageEntry[] = [
  {
    id: 'lin-p4',
    bridge_person_id: 'p4',
    family: 'บ้านเชียงใหม่',
    family_en: 'Chiang Mai Lineage',
    code: 'CM-2K14-WPR',
    linked_tree_id: null,
    preview: [
      { id: 'w1', nick: 'บุญมี',  born: 1900, died: 1970, gender: 'm' },
      { id: 'w2', nick: 'เพ็ญ',   born: 1905, died: 1980, gender: 'f', spouseOf: 'w1' },
      { id: 'w3', nick: 'สุทิน',  born: 1925, died: 1998, gender: 'm', parents: ['w1','w2'] },
      { id: 'w4', nick: 'บัวลอย', born: 1928, died: 2015, gender: 'f', spouseOf: 'w3' },
      { id: 'p4', nick: 'วิภา',   born: 1948, died: null, gender: 'f', parents: ['w3','w4'], isBridge: true },
    ],
  },
  {
    id: 'lin-p6',
    bridge_person_id: 'p6',
    family: 'บ้านใจดี',
    family_en: 'Jaidee Family',
    code: 'JAIDEE-8K21-TR3E',
    linked_tree_id: null,
    preview: [
      { id: 'j1', nick: 'บุญส่ง',  born: 1898, died: 1972, gender: 'm' },
      { id: 'j2', nick: 'สุดใจ',   born: 1902, died: 1978, gender: 'f', spouseOf: 'j1' },
      { id: 'j3', nick: 'จรูญ',    born: 1924, died: 1998, gender: 'm', parents: ['j1','j2'] },
      { id: 'j4', nick: 'เฉลา',    born: 1928, died: 2010, gender: 'f', spouseOf: 'j3' },
      { id: 'p6', nick: 'ประนอม', born: 1950, died: null, gender: 'f', parents: ['j3','j4'], isBridge: true },
    ],
  },
  {
    id: 'lin-p8',
    bridge_person_id: 'p8',
    family: 'บ้านแก้วใส',
    family_en: 'Kaewsai Family',
    code: 'KAEWSAI-4N19-HM1',
    linked_tree_id: null,
    preview: [
      { id: 'k1', nick: 'แก้ว',   born: 1920, died: 1990, gender: 'm' },
      { id: 'k2', nick: 'ใส',     born: 1925, died: 2005, gender: 'f', spouseOf: 'k1' },
      { id: 'k3', nick: 'ดำรง',   born: 1948, died: null, gender: 'm', parents: ['k1','k2'] },
      { id: 'k4', nick: 'พิมพ์',  born: 1951, died: null, gender: 'f', spouseOf: 'k3' },
      { id: 'p8', nick: 'ดาริน',  born: 1975, died: null, gender: 'f', parents: ['k3','k4'], isBridge: true },
    ],
  },
  {
    id: 'lin-p10',
    bridge_person_id: 'p10',
    family: 'บ้านพงษ์ไพศาล',
    family_en: 'Pongpaisarn Family',
    code: 'PONG-XQ82-PL5R',
    linked_tree_id: null,
    preview: [
      { id: 'g1', nick: 'พงษ์',   born: 1895, died: 1968, gender: 'm' },
      { id: 'g2', nick: 'ไพศาล',  born: 1922, died: 2001, gender: 'm', parents: ['g1'] },
      { id: 'g3', nick: 'สมจิต',  born: 1926, died: 2012, gender: 'f', spouseOf: 'g2' },
      { id: 'p10', nick: 'ธนา',   born: 1971, died: null, gender: 'm', parents: ['g2','g3'], isBridge: true },
    ],
  },
];

// ---------------------------------------------------------------------------
// Seed function
// ---------------------------------------------------------------------------

export async function seedDemo(
  db: DB,
): Promise<{ created: boolean; tree_id: string }> {
  // Idempotency check
  const existing = await db
    .select({ id: trees.id })
    .from(trees)
    .where(eq(trees.slug, TREE_SLUG))
    .get();

  if (existing) {
    return { created: false, tree_id: existing.id };
  }

  // 1. Insert tree
  await db.batch([
    db.insert(trees).values({
      id: TREE_ID,
      slug: TREE_SLUG,
      name: 'บ้านวงศ์สุริยา',
      name_en: 'Wongsuriya Family',
      owner_id: null,
      is_public: true,
    }),
  ]);

  // 2. Insert people (all 16) — batch requires at least 1 item
  const peopleValues = PEOPLE_DATA.map((p) => ({
    id: p.id,
    tree_id: TREE_ID,
    name: p.name,
    name_en: p.name_en,
    nick: p.nick,
    born: p.born,
    died: p.died,
    gender: p.gender,
    hometown: p.hometown,
    is_me: p.is_me,
    external: p.external,
    avatar_key: null as string | null,
    extra: null as unknown,
  }));
  const [firstPerson, ...restPeople] = peopleValues;
  const peopleInserts: [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]] = [
    db.insert(people).values(firstPerson),
    ...restPeople.map((v) => db.insert(people).values(v)),
  ];
  await db.batch(peopleInserts);

  // 3. Insert relations
  const [firstRel, ...restRels] = RELATIONS_DATA;
  const relationInserts: [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]] = [
    db.insert(relations).values({ tree_id: TREE_ID, ...firstRel }),
    ...restRels.map((r) => db.insert(relations).values({ tree_id: TREE_ID, ...r })),
  ];
  await db.batch(relationInserts);

  // 4. Insert stories
  const [firstStory, ...restStories] = STORIES_DATA;
  const storyInserts: [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]] = [
    db.insert(stories).values({ ...firstStory, created_by: null }),
    ...restStories.map((s) => db.insert(stories).values({ ...s, created_by: null })),
  ];
  await db.batch(storyInserts);

  // 5. Insert memos
  const [firstMemo, ...restMemos] = MEMOS_DATA;
  const memoInserts: [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]] = [
    db.insert(memos).values({ ...firstMemo, object_key: null }),
    ...restMemos.map((m) => db.insert(memos).values({ ...m, object_key: null })),
  ];
  await db.batch(memoInserts);

  // 6. Insert lineages
  const [firstLineage, ...restLineages] = LINEAGES_DATA;
  const lineageInserts: [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]] = [
    db.insert(lineages).values({
      id: firstLineage.id,
      bridge_person_id: firstLineage.bridge_person_id,
      family: firstLineage.family,
      family_en: firstLineage.family_en,
      code: firstLineage.code,
      linked_tree_id: firstLineage.linked_tree_id,
    }),
    ...restLineages.map((l) =>
      db.insert(lineages).values({
        id: l.id,
        bridge_person_id: l.bridge_person_id,
        family: l.family,
        family_en: l.family_en,
        code: l.code,
        linked_tree_id: l.linked_tree_id,
      }),
    ),
  ];
  await db.batch(lineageInserts);

  // 7. Insert lineage members
  const allMembers = LINEAGES_DATA.flatMap((l) =>
    l.preview.map((person, idx) => ({
      id: `lm-${l.id}-${idx}`,
      lineage_id: l.id,
      person_data: person as unknown,
    })),
  );
  const [firstMember, ...restMembers] = allMembers;
  const memberInserts: [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]] = [
    db.insert(lineage_members).values(firstMember),
    ...restMembers.map((m) => db.insert(lineage_members).values(m)),
  ];
  await db.batch(memberInserts);

  return { created: true, tree_id: TREE_ID };
}
