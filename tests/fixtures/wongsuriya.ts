/**
 * Wongsuriya family fixture for unit tests.
 *
 * Contains all 16 people from data.js, PLUS k3 (Damrong) and k4 (Pim) from the
 * Kaewsai lineage inlined as regular people so that tests can reach Darin's (p8)
 * maternal ancestors. k3/k4 are marked external:true, lineageOf:'kaewsai'.
 *
 * IDs p1–p16 preserved exactly as in data.js.
 * k3 = Damrong (Darin's father, m, 1948)
 * k4 = Pim (Darin's mother, f, 1951) — spouseOf k3
 * p8 gets parents: ['k3','k4'] to wire up the ancestry.
 */
import type { TreeData, Person } from '@app/lib/types';

const people: Person[] = [
  // Gen 1 — great-grandparents (Wongsuriya paternal line)
  { id: 'p1', name: 'ก้าน วงศ์สุริยา',     nameEn: 'Kan Wongsuriya',      nick: 'ก้าน',   born: 1918, died: 1994, gender: 'm', hometown: 'อยุธยา' },
  { id: 'p2', name: 'มาลี วงศ์สุริยา',     nameEn: 'Malee Wongsuriya',    nick: 'มาลี',  born: 1922, died: 2001, gender: 'f', hometown: 'อยุธยา', spouseOf: 'p1' },

  // Gen 2 — grandparents (paternal)
  { id: 'p3', name: 'สมชาย วงศ์สุริยา',   nameEn: 'Somchai Wongsuriya',  nick: 'สมชาย', born: 1945, died: 2018, gender: 'm', hometown: 'กรุงเทพ', parents: ['p1','p2'] },
  { id: 'p4', name: 'วิภา วงศ์สุริยา',     nameEn: 'Wipa Wongsuriya',     nick: 'วิภา',  born: 1948, died: null, gender: 'f', hometown: 'เชียงใหม่', spouseOf: 'p3', external: true },
  { id: 'p5', name: 'ประยุทธ วงศ์สุริยา', nameEn: 'Prayuth Wongsuriya',  nick: 'ประยุทธ', born: 1947, died: null, gender: 'm', hometown: 'กรุงเทพ', parents: ['p1','p2'] },
  { id: 'p6', name: 'ประนอม ใจดี',        nameEn: 'Pranom Jaidee',        nick: 'ประนอม', born: 1950, died: null, gender: 'f', hometown: 'นครปฐม', spouseOf: 'p5', external: true },

  // Gen 3 — parents generation
  { id: 'p7', name: 'อรุณ วงศ์สุริยา',    nameEn: 'Arun Wongsuriya',     nick: 'อรุณ',  born: 1972, died: null, gender: 'm', hometown: 'กรุงเทพ', parents: ['p3','p4'] },
  // p8 Darin — extended with Kaewsai parents k3/k4
  { id: 'p8', name: 'ดาริน แก้วใส',        nameEn: 'Darin Kaewsai',       nick: 'ดาริน', born: 1975, died: null, gender: 'f', hometown: 'ขอนแก่น', spouseOf: 'p7', external: true, parents: ['k3','k4'] },
  { id: 'p9', name: 'อรวรรณ วงศ์สุริยา',  nameEn: 'Orawan Wongsuriya',   nick: 'อรวรรณ', born: 1974, died: null, gender: 'f', hometown: 'กรุงเทพ', parents: ['p3','p4'] },
  { id: 'p10', name: 'ธนา พงษ์ไพศาล',    nameEn: 'Thana Pongpaisarn',   nick: 'ธนา',   born: 1971, died: null, gender: 'm', hometown: 'ระยอง', spouseOf: 'p9', external: true },
  { id: 'p11', name: 'ไพโรจน์ วงศ์สุริยา', nameEn: 'Pairot Wongsuriya',  nick: 'ไพโรจน์', born: 1976, died: null, gender: 'm', hometown: 'ภูเก็ต', parents: ['p5','p6'] },

  // Gen 4 — Napa's generation
  { id: 'p12', name: 'นภา วงศ์สุริยา',    nameEn: 'Napa Wongsuriya',     nick: 'นภา',   born: 2001, died: null, gender: 'f', hometown: 'กรุงเทพ', parents: ['p7','p8'], isMe: true },
  { id: 'p13', name: 'ภูมิ วงศ์สุริยา',   nameEn: 'Phum Wongsuriya',     nick: 'ภูมิ',  born: 2005, died: null, gender: 'm', hometown: 'กรุงเทพ', parents: ['p7','p8'] },
  { id: 'p14', name: 'กานต์ พงษ์ไพศาล',  nameEn: 'Kan Pongpaisarn',     nick: 'กานต์', born: 1998, died: null, gender: 'm', hometown: 'กรุงเทพ', parents: ['p9','p10'] },
  { id: 'p15', name: 'แพรว พงษ์ไพศาล',  nameEn: 'Praew Pongpaisarn',   nick: 'แพรว',  born: 2000, died: null, gender: 'f', hometown: 'ระยอง', parents: ['p9','p10'] },
  { id: 'p16', name: 'ติณณ์ วงศ์สุริยา', nameEn: 'Tin Wongsuriya',      nick: 'ติณณ์', born: 2008, died: null, gender: 'm', hometown: 'ภูเก็ต', parents: ['p11'] },

  // Kaewsai expanded ancestors (Darin's parents — inlined for test coverage)
  { id: 'k3', name: 'ดำรง แก้วใส',        nameEn: 'Damrong Kaewsai',     nick: 'ดำรง',  born: 1948, died: null, gender: 'm', external: true, lineageOf: 'kaewsai' },
  { id: 'k4', name: 'พิมพ์ แก้วใส',       nameEn: 'Pim Kaewsai',         nick: 'พิมพ์', born: 1951, died: null, gender: 'f', external: true, lineageOf: 'kaewsai', spouseOf: 'k3' },
];

export const wongsuriya: TreeData = {
  meta: {
    treeName: 'บ้านวงศ์สุริยา',
    treeNameEn: 'Wongsuriya Family',
    ownerId: 'p12',
    visibility: 'public',
  },
  people,
  stories: {
    p1:  [{ year: 1946, title: 'แต่งงานกับมาลี', body: 'พิธีจัดที่บ้านริมน้ำอยุธยา 3 วัน 3 คืน' }, { year: 1953, title: 'เปิดร้านทองร้านแรก', body: 'ชื่อร้าน "สุริยาทอง" ตลาดหัวรอ' }],
    p3:  [{ year: 1968, title: 'ย้ายเข้ากรุงเทพ', body: 'มาทำงานธนาคารที่สำนักงานใหญ่' }, { year: 1971, title: 'พบวิภาบนรถไฟเหนือ', body: 'เจอกันตอนนั่งไปเชียงใหม่' }],
    p7:  [{ year: 1999, title: 'แต่งงานกับดาริน', body: 'งานเล็กๆ ที่บ้านทวด' }, { year: 2001, title: 'ลูกคนแรกเกิด — นภา', body: 'คลอดที่โรงพยาบาลศิริราช' }],
    p12: [{ year: 2019, title: 'เริ่มทำ family tree นี้', body: 'หลังคุยกับวิภาช่วงปีใหม่' }, { year: 2024, title: 'เจอญาติสายไพโรจน์ที่ภูเก็ต', body: 'ไปเที่ยวแล้วทักทาย ได้ merge tree กัน' }],
  },
  memos: {
    p4:  [{ by: 'p12', duration: 47,  title: 'วิภาเล่าเรื่องตอนเด็ก',  date: '2024-12-24' }],
    p3:  [{ by: 'p7',  duration: 92,  title: 'อรุณเล่าเรื่องสมชาย',    date: '2019-05-02' }],
    p1:  [{ by: 'p3',  duration: 210, title: 'ก้านร้องเพลงกล่อม',      date: '1992-07-15' }],
  },
  photos: { p1: 12, p2: 8, p3: 34, p4: 41, p5: 15, p6: 9, p7: 88, p8: 67, p9: 22, p10: 18, p11: 14, p12: 203, p13: 156, p14: 45, p15: 38, p16: 27 },
};
