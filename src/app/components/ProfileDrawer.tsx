import type { Person, TreeData } from '@app/lib/types';
import { computeRelation } from '@app/lib/kinship';
import { Tab } from './Tab';

export interface ProfileDrawerProps {
  person: Person;
  data: TreeData;
  onClose: () => void;
  onJumpTo: (id: string) => void;
  expandedLineages: Set<string>;
  onToggleLineage: (personId: string) => void;
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
}: ProfileDrawerProps) {
  if (!person) return null;

  const stories = (data.stories?.[person.id] || []);
  const memos = (data.memos?.[person.id] || []);
  const photoCount = data.photos?.[person.id] || 0;

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
              fontFamily="Cormorant Garamond, serif"
              fontSize="48"
              fontWeight="600"
              fill="var(--ink)"
              opacity="0.75"
            >
              {(person.name || '').charAt(0)}
            </text>
          </svg>
          <button className="photo-upload-btn">+ เพิ่มรูป</button>
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
            {person.died && (
              <span className="meta-chip passed">
                <span>จากไป</span>
                {person.died}
              </span>
            )}
            <span className="meta-chip">
              <span>จาก</span>
              {person.hometown}
            </span>
          </div>
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
          <div className="photo-grid">
            {Array.from({ length: Math.min(9, photoCount) }).map((_, i) => (
              <div
                key={i}
                className="photo-tile"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className="photo-tile-bg" />
                <div className="photo-tile-label">{1950 + ((i * 7) % 70)}</div>
              </div>
            ))}
            {photoCount > 9 && (
              <div className="photo-tile more">+{photoCount - 9}</div>
            )}
          </div>
          <button className="btn-primary full-width">
            <span>↑</span> อัปโหลดรูปใหม่
          </button>
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
