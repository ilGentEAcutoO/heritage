import { useState } from 'react';

export interface TabProps {
  label: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

/**
 * Collapsible section with caret — ported from panels.jsx `function Tab(...)`.
 * State is per-instance (useState).
 */
export function Tab({ label, count, defaultOpen = false, children }: TabProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`tab ${open ? 'open' : ''}`}>
      <button className="tab-head" onClick={() => setOpen(o => !o)}>
        <span className="tab-label">{label}</span>
        <span className="tab-count">{count}</span>
        <span className="tab-caret">{open ? '–' : '+'}</span>
      </button>
      {open && <div className="tab-body">{children}</div>}
    </div>
  );
}
