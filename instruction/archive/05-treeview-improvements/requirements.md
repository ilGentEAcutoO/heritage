# Requirements — TreeView UX Improvements (User Menu + POV-from-Profile)

> Created: 2026-05-02 16:01 (+07)
> Amended: 2026-05-02 16:08 (+07) — added Feature 2 (POV from ProfileDrawer)
> Workstream: 05-treeview-improvements (renamed from 05-user-menu)
> Source:
>   1. "/workflow-plan แก้ไข demo … ให้มันมีเมนูผู้ใช้ให้ล็อคอินกับไปหน้าหลักด้วย"
>   2. "เรื่องของดูจากมุมมอง คลิกที่ node คนนั้น ๆ อยากให้มีปุ่มเพื่อดูจากมุมมองคนนั้นเลย"

## Original Request

แก้ไขหน้า demo (`/demo/wongsuriya`) ให้มี **เมนูผู้ใช้** ที่ทำสองอย่าง:
1. **ล็อคอิน** (สำหรับ guest)
2. **กลับหน้าหลัก** (back to landing)

## Context (จาก codebase)

- Route ใช้ `TreeView` component — `src/app/pages/TreeView.tsx`
- Component เดียวกันถูกใช้ทั้ง `/demo/wongsuriya` (anonymous demo) และ `/tree/:slug` (authenticated trees)
- Header actions ปัจจุบัน: "เราเกี่ยวกันยังไง?", "แชร์" (owner only), "⚙" (tweaks)
- `useSession` hook มีพร้อม: `user`, `loading`, `logout`
- Landing page (`/`) มี logout pattern แล้ว — ใช้ `data-testid="logout-button"`

## Open Questions (รอ user ยืนยัน)

### Q1 — Scope ของการเพิ่ม user menu
- (a) เฉพาะ `/demo/wongsuriya` เท่านั้น (literal interpretation)
- (b) ใช้กับทุก `TreeView` (รวม `/tree/:slug` ของผู้ใช้จริง) — เพราะใช้ component เดียวกัน

### Q2 — UI pattern ของ user menu
- (a) **Dropdown menu** (avatar/icon คลิกแล้วเปิด menu) — มาตรฐาน, ขยาย item ได้ในอนาคต
- (b) **Inline buttons** ใน header (โผล่ปุ่ม "หน้าหลัก" + "เข้าสู่ระบบ" / "ออกจากระบบ" ตรง ๆ) — เรียบง่าย, ไม่ต้องคลิกซ้อน

### Q3 — Behavior สำหรับ authenticated user บน demo page
- (a) โชว์ "หน้าหลัก" + "ออกจากระบบ" + ชื่อผู้ใช้
- (b) โชว์ "หน้าหลัก" + ลิงก์ไป "ต้นไม้ของฉัน" (`/trees`) + "ออกจากระบบ"

### Q4 — เป็น component reusable หรือใส่ใน header เดิม?
- (a) สร้าง `<UserMenu />` component ใหม่ → reuse ได้หลายหน้า
- (b) เพิ่มใน header ของ TreeView ตรง ๆ (ไม่แยก component)

## Agreed Scope

- [x] **Q1(b)** เพิ่ม user menu ในทุกหน้า `TreeView` (รวม `/demo/wongsuriya` และ `/tree/:slug`)
- [x] **Q2(a)** UI = **Dropdown menu** (avatar/icon button คลิกเปิด popover)
- [x] **Q3(b)** Authenticated user เห็น: "หน้าหลัก" + "ต้นไม้ของฉัน" (`/trees`) + "ออกจากระบบ" + ชื่อ/email บนหัว menu
- [x] **Q4(a)** สร้างเป็น `<UserMenu />` reusable component → ใช้ใน TreeView (และอนาคตหน้า Trees, Landing ก็ swap ได้)

## Technical Decisions

- **File**: `src/app/components/UserMenu.tsx` + export ใน `src/app/components/index.ts`
- **Slot**: ใส่ใน `header-actions` ของ TreeView (ตำแหน่งขวาสุดถัดจาก ⚙)
- **Trigger**: button ใช้ `header-btn` class เดิม → icon (👤 หรือ initial ของ user)
- **Dropdown**: position absolute ใต้ trigger, click-outside-to-close, `Escape` to close
- **Session-aware items**:
  - `loading` → ไม่ render (กัน flicker)
  - guest → "🏠 หน้าหลัก" + divider + "เข้าสู่ระบบ"
  - authenticated → header แสดง displayName/email + "🏠 หน้าหลัก" + "🌳 ต้นไม้ของฉัน" + divider + "ออกจากระบบ"
- **Accessibility**: `aria-expanded`, `aria-haspopup="menu"`, `role="menu"`, focus trap ไม่ต้อง (เพราะ click-outside พอ)
- **Test strategy**:
  - **Unit (source-level)** — `tests/unit/UserMenu.test.tsx`: ตรวจว่า component import `useSession`, มี item ครบ 3 case (guest/auth/loading), Link ไป `/`, `/login`, `/trees`
  - **E2E (Playwright)** — `tests/e2e/11-user-menu.spec.ts`: เปิด demo → คลิกเมนู → เห็น "หน้าหลัก" + "เข้าสู่ระบบ" → กด "หน้าหลัก" → URL เป็น `/`; signup+verify → เข้า demo → เมนูเป็น auth state → กด logout
- **No new dependencies** (ไม่ใช้ headlessui/radix — เขียน dropdown เล็ก ๆ ด้วย useState + useEffect click-outside)
- **Security**: ปุ่ม logout เรียก `apiClient.logout()` ผ่าน `useSession` (มี CSRF/cookie handling อยู่แล้ว — ไม่ต้องแตะ)

---

## Feature 2 — POV button in ProfileDrawer (amendment)

### Original Request

"เรื่องของดูจากมุมมอง คลิกที่ node คนนั้น ๆ อยากให้มีปุ่มเพื่อดูจากมุมมองคนนั้นเลย"

### Context (จาก codebase)

- POV mechanism (state `activeViewId` + `ActiveViewPill` dropdown) ทำงานสมบูรณ์แล้ว
- Click ที่ PersonNode → `setSelectedId` → `ProfileDrawer` เปิด — แต่ drawer **ไม่มี shortcut ไปเปลี่ยน activeViewId**
- ปัจจุบันต้องไปที่ ActiveViewPill (มุมล่าง) แล้ว select จาก dropdown — เสียจังหวะ

### Agreed Design

- **เพิ่มปุ่มใน ProfileDrawer** ตรง `profile-ident` ใต้ชื่อ
- Label: "👁 ดูจากมุมของ {nick}" — เมื่อ person นั้นยังไม่ใช่ POV
- เมื่อ person คือ POV ปัจจุบันแล้ว → แสดง **chip readonly** "✓ กำลังดูจากมุมของคนนี้" (หรือซ่อน)
- คลิกแล้ว: `setActiveViewId(person.id)` → `ActiveViewPill` และ label บน TreeCanvas อัปเดตทันที (drawer ไม่ปิด — user อาจอยากกลับไปดูคนเดิม)

### Technical Decisions

- **ProfileDrawer props (new)**: `onSetActiveView: (id: string) => void`, `isActiveView: boolean`
- **TreeView wiring**: ส่ง `onSetActiveView={setActiveViewId}`, `isActiveView={selected.id === activeViewId}`
- **No state changes** ใน ProfileDrawer (stateless trigger)
- **Test**: source-level (props exist, button conditionally rendered) + e2e (คลิก node → drawer → กดปุ่ม → ActiveViewPill text เปลี่ยน)
