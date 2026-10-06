// Shell building blocks: icons, page header, cards, toasts.
import { useEffect, useState, type ReactNode } from 'react';

const PATHS: Record<string, string> = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  play: 'M7 4.5v15l12-7.5z',
  flow: 'M4 6h6v4H4zM14 14h6v4h-6zM7 10v4h10M17 10V6h-3',
  table: 'M3 5h18v14H3zM3 10h18M3 15h18M9 5v14',
  users: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8',
  archive: 'M3 4h18v4H3zM5 8v12h14V8M10 12h4',
  logout: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3',
  key: 'M15 7a4 4 0 1 1-3.5 6L4 20v-3h3v-3h3l1.5-1.5A4 4 0 0 1 15 7z',
  file: 'M6 3h8l5 5v13H6zM14 3v5h5',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  check: 'M5 12.5 10 17 19 7',
  alert: 'M12 4 2.5 20h19zM12 10v4M12 17.5v.5',
  calc: 'M6 3h12v18H6zM9 7h6M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01',
  save: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
  rocket: 'M5 15c-1 1-1.5 3.5-1.5 5.5 2 0 4.5-.5 5.5-1.5M9 15l-3-3c2-5 6-8 13-8 0 7-3 11-8 13zM15 9.5a1 1 0 1 0 0-.01',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2',
  plus: 'M12 5v14M5 12h14',
  chevron: 'M9 6l6 6-6 6',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v6M12 7.5v.5',
  x: 'M6 6l12 12M18 6 6 18',
  pen: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
};

export function Icon({ name, size = 18 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name] ?? PATHS.info} />
    </svg>
  );
}

export function PageHeader({ title, subtitle, actions, crumb }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; crumb?: ReactNode }) {
  return (
    <div className="page-header">
      <div className="page-title">
        {crumb && <div className="crumb">{crumb}</div>}
        <h1>{title}</h1>
        {subtitle && <div className="page-sub">{subtitle}</div>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className, step }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; step?: number }) {
  return (
    <div className={`card${className ? ` ${className}` : ''}`}>
      {(title || actions) && (
        <div className="card-head">
          <div className="card-title">
            {step !== undefined && <span className="step">{step}</span>}
            {title}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </div>
      )}
      <div className="card-body">{children}</div>
    </div>
  );
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const s = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0];
  return s.toUpperCase();
}

// ---- toasts: messages float, so they never push the page content ----
type Toast = { id: number; kind: 'ok' | 'error' | 'warning' | 'info'; text: ReactNode };
let listeners: ((t: Toast) => void)[] = [];
let seq = 0;
export function toast(kind: Toast['kind'], text: ReactNode) {
  const t = { id: ++seq, kind, text };
  listeners.forEach((l) => l(t));
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    const l = (t: Toast) => {
      setItems((xs) => [...xs.slice(-3), t]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== t.id)), t.kind === 'error' ? 9000 : 5000);
    };
    listeners.push(l);
    return () => {
      listeners = listeners.filter((x) => x !== l);
    };
  }, []);
  return (
    <div className="toaster" role="status">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          <Icon name={t.kind === 'ok' ? 'check' : t.kind === 'info' ? 'info' : 'alert'} />
          <div className="toast-text">{t.text}</div>
          <button type="button" className="icon-btn" onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))} aria-label="Đóng">
            <Icon name="x" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
