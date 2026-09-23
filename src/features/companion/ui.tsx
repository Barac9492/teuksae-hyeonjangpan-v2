import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { TabId } from './constants';

export type Venue = 'songrim' | 'dream';
export type Tone = 'good' | 'neutral' | 'amber' | 'red';
export type ValueTone = 'neutral' | 'good' | 'warn' | 'stop';

export function TabIcon({ tab }: { tab: TabId }) {
  const paths: Record<TabId, ReactNode> = {
    worship: <><path d="M5 20V11l7-5.5 7 5.5v9" /><path d="M3 20h18M10 20v-5h4v5M12 2v4M10.2 3.7h3.6" /></>,
    parking: <><rect x="4" y="3.5" width="16" height="17" rx="4.5" /><path d="M10 16.5v-9h2.8a2.9 2.9 0 010 5.8H10" /></>,
    prayer: <><path d="M12 20.5s-7.5-4.8-7.5-10.3A4.2 4.2 0 0112 7.7a4.2 4.2 0 017.5 2.5c0 5.5-7.5 10.3-7.5 10.3z" /></>,
    sharing: <><path d="M4.5 10.5h12v3.2a5.3 5.3 0 01-5.3 5.3h-1.4a5.3 5.3 0 01-5.3-5.3z" /><path d="M16.5 11.5h1.7a2.6 2.6 0 010 5.2h-2.3M3.5 21.5h15M8 3.5c-.8 1 .8 2-.1 3.2M12 2.5c-.8 1.2.8 2.3-.1 3.7" /></>,
    photos: <><rect x="3.5" y="5" width="17" height="14.5" rx="3" /><circle cx="12" cy="12.2" r="3.4" /><path d="M8.5 5l1.3-2h4.4l1.3 2" /></>,
  };
  return <svg className="tc-tab-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[tab]}</svg>;
}

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    closeRef.current?.focus();
    return () => {
      if (dialog.open && typeof dialog.close === 'function') dialog.close();
      previousFocus.current?.focus();
    };
  }, []);

  return (
    <dialog
      className={`tc-dialog${wide ? ' tc-dialog--wide' : ''}`}
      ref={dialogRef}
      aria-labelledby="tc-dialog-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); onClose(); } }}
      onClick={(event) => { if (event.target === dialogRef.current) onClose(); }}
    >
      <div className="tc-dialog__header">
        <h2 id="tc-dialog-title">{title}</h2>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="닫기"><span aria-hidden="true">×</span></button>
      </div>
      <div className="tc-dialog__body">{children}</div>
    </dialog>
  );
}

export function VenueSwitch({ venue, onChange, label }: { venue: Venue; onChange: (venue: Venue) => void; label: string }) {
  return (
    <div className="tc-venue-switch" role="group" aria-label={label} data-active={venue}>
      <span className="tc-venue-switch__thumb" aria-hidden="true" />
      <button type="button" aria-pressed={venue === 'songrim'} onClick={() => onChange('songrim')}>이매 · 송림본당</button>
      <button type="button" aria-pressed={venue === 'dream'} onClick={() => onChange('dream')}>서현 · 드림센터</button>
    </div>
  );
}

export function StatusLead({ label, title, children, tone = 'good' }: { label: string; title: string; children: ReactNode; tone?: Tone }) {
  return (
    <div className={`tc-status-lead tc-status-lead--${tone}`}>
      <span className="tc-status-lead__glow" aria-hidden="true" />
      <span className="tc-tiny">{label}</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

export function StatusRow({ name, extra, value, tone = 'neutral' }: { name: string; extra?: string; value: string; tone?: ValueTone }) {
  return (
    <div className="tc-status-row">
      <span>{name}{extra && <small>{extra}</small>}</span>
      <span className={`tc-status-value tc-status-value--${tone}`}>{value}</span>
    </div>
  );
}

export function PageHeading({ eyebrow, title, children, art }: { eyebrow: string; title: string; children: ReactNode; art?: ReactNode }) {
  return (
    <header className="tc-page-heading">
      <div>
        <span className="tc-eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{children}</p>
      </div>
      {art && <div className="tc-page-heading__art" aria-hidden="true">{art}</div>}
    </header>
  );
}

export function Sun({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="tc-sun">
      <circle cx="12" cy="12" r="4.2" fill="currentColor" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => <path key={deg} d="M12 2.5v2.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" transform={`rotate(${deg} 12 12)`} />)}
    </svg>
  );
}

/** Small spaced numerals like the poster's "2 0 2 6". */
export function Spaced({ text }: { text: string }) {
  return <span className="tc-spaced" aria-label={text}>{text.split('').map((char, index) => <span key={index} aria-hidden="true">{char}</span>)}</span>;
}
