import type { Person } from '@app/lib/types';

export interface SidebarProps {
  data: { people: Person[] };
  selectedId: string | null;
  onSelect: (id: string) => void;
  query: string;
  onQueryChange: (q: string) => void;
  filteredPeople: Person[];
  stats: {
    total: number;
    generations: number;
    alive: number;
    photos: number;
  };
}

/**
 * Sidebar — ported from the `<aside className="sidebar">` in Family Tree.html (lines 133–189).
 * Sections: search input, people list sorted by born, 2x2 stats grid, legend.
 */
export function Sidebar({
  selectedId,
  onSelect,
  query,
  onQueryChange,
  filteredPeople,
  stats,
}: SidebarProps) {
  const sorted = [...filteredPeople].sort(
    (a, b) => (a.born ?? 0) - (b.born ?? 0),
  );

  return (
    <aside className="sidebar">
      {/* Search */}
      <div className="sidebar-section">
        <h4>ค้นหา / Search</h4>
        <div className="sidebar-search">
          <input
            placeholder="ชื่อ, ชื่อเล่น, บ้านเกิด..."
            value={query}
            onChange={e => onQueryChange(e.target.value)}
          />
        </div>
      </div>

      {/* People list */}
      <div className="sidebar-section">
        <h4>คนในตระกูล ({filteredPeople.length})</h4>
        <div className="people-list">
          {sorted.map(p => (
            <button
              key={p.id}
              className={`people-item ${!p.died ? 'alive' : ''} ${
                p.id === selectedId ? 'active' : ''
              }`}
              onClick={() => onSelect(p.id)}
            >
              <span className="dot" />
              <span className="name">{p.nick}</span>
              <span className="yr">{p.born}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Stats grid */}
      <div className="sidebar-section">
        <h4>สถิติ</h4>
        <div className="sidebar-stats">
          <div className="stat-card">
            <div className="num">{stats.total}</div>
            <div className="lbl">คน</div>
          </div>
          <div className="stat-card">
            <div className="num">{stats.generations}</div>
            <div className="lbl">รุ่น</div>
          </div>
          <div className="stat-card">
            <div className="num">{stats.alive}</div>
            <div className="lbl">ยังอยู่</div>
          </div>
          <div className="stat-card">
            <div className="num">{stats.photos}</div>
            <div className="lbl">รูป</div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="sidebar-section">
        <h4>Legend</h4>
        <div className="legend">
          <div className="legend-row">
            <span className="legend-sw me" />
            ฉัน / Me
          </div>
          <div className="legend-row">
            <span className="legend-sw alive" />
            ยังมีชีวิต
          </div>
          <div className="legend-row">
            <span className="legend-sw passed" />
            จากไปแล้ว
          </div>
          <div className="legend-row">
            <span className="legend-sw ext" />
            จาก tree อื่น
          </div>
        </div>
      </div>
    </aside>
  );
}
