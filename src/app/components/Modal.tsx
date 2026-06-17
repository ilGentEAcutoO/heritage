/**
 * Modal.tsx — shared dialog shell.
 *
 * One overlay + panel for every centered dialog (CreateTree, Share, AddPerson…),
 * with the behaviour those used to hand-roll inconsistently:
 *  - role="dialog" + aria-modal, labelled by a title element or an explicit label
 *  - Escape to close + click-outside to close (both suppressed while `busy`)
 *  - focus moves into the panel on open and is restored to the trigger on close
 *  - Tab is trapped within the panel
 *  - fade+scale entrance (neutralised under prefers-reduced-motion globally)
 *
 * Visual styling lives in styles.css (.modal-overlay / .modal-panel); content is
 * supplied as children and should use the shared .field-*, .segmented, .btn-*
 * classes so every dialog reads as one system.
 */

import { useEffect, useRef, type ReactNode } from 'react';

export interface ModalProps {
  onClose: () => void;
  children: ReactNode;
  /** id of the visible title element that names the dialog */
  labelledBy?: string;
  /** accessible name when there is no visible title to point at */
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  /** while true, Escape and backdrop clicks won't close (e.g. request in flight) */
  busy?: boolean;
  testId?: string;
}

const SIZE: Record<NonNullable<ModalProps['size']>, string> = {
  sm: '360px',
  md: '440px',
  lg: '560px',
};

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  onClose,
  children,
  labelledBy,
  label,
  size = 'md',
  busy = false,
  testId,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Mirror `busy` in a ref so the key/click handlers always see the latest value
  // without re-binding the document listener mid-request.
  const busyRef = useRef(busy);
  busyRef.current = busy;

  // Move focus into the panel on open; restore it to the trigger on close.
  useEffect(() => {
    const prevActive = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();
    return () => prevActive?.focus?.();
  }, []);

  // Escape to close + Tab focus trap.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (!busyRef.current) onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busyRef.current) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
        style={{ maxWidth: SIZE[size] }}
        tabIndex={-1}
        data-testid={testId}
      >
        {children}
      </div>
    </div>
  );
}
