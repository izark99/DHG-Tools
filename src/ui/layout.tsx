// Shell building blocks: icons, page header, cards, toasts.
import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { nextTheme, setThemePref, THEME_ICON, THEME_LABEL, useThemePref } from './theme';
import {
  IconAlertTriangle,
  IconArchive,
  IconBook2,
  IconCalculator,
  IconCheck,
  IconChevronRight,
  IconDeviceDesktop,
  IconDeviceFloppy,
  IconDownload,
  IconFileText,
  IconHierarchy2,
  IconHistory,
  IconHome,
  IconInfoCircle,
  IconKey,
  IconLogout,
  IconMoon,
  IconPencil,
  IconPlayerPlay,
  IconPlus,
  IconRocket,
  IconShieldLock,
  IconSun,
  IconTable,
  IconUpload,
  IconUser,
  IconUsers,
  IconX,
  type Icon as TablerIcon,
} from '@tabler/icons-react';

// Tabler icons, as in Twenty (16px, light stroke).
const ICONS: Record<string, TablerIcon> = {
  home: IconHome,
  play: IconPlayerPlay,
  flow: IconHierarchy2,
  table: IconTable,
  users: IconUsers,
  user: IconUser,
  archive: IconArchive,
  book: IconBook2,
  logout: IconLogout,
  key: IconKey,
  shield: IconShieldLock,
  file: IconFileText,
  upload: IconUpload,
  download: IconDownload,
  check: IconCheck,
  alert: IconAlertTriangle,
  calc: IconCalculator,
  save: IconDeviceFloppy,
  rocket: IconRocket,
  history: IconHistory,
  plus: IconPlus,
  chevron: IconChevronRight,
  info: IconInfoCircle,
  x: IconX,
  pen: IconPencil,
  sun: IconSun,
  moon: IconMoon,
  desktop: IconDeviceDesktop,
};

export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const C = ICONS[name] ?? IconInfoCircle;
  return <C className="icon" size={size} stroke={1.6} aria-hidden="true" />;
}

/** Icon button that cycles the colour theme: system → light → dark. */
export function ThemeToggle() {
  const pref = useThemePref();
  const next = nextTheme(pref);
  return (
    <button
      type="button"
      className="icon-btn"
      title={`Giao diện: ${THEME_LABEL[pref]} — bấm để chuyển sang ${THEME_LABEL[next]}`}
      aria-label={`Chế độ màu: ${THEME_LABEL[pref]}`}
      onClick={() => setThemePref(next)}
    >
      <Icon name={THEME_ICON[pref]} />
    </button>
  );
}

/** Id of the fixed bar above the scrolling page body (rendered by the shell). */
export const PAGE_BAR_ID = 'page-bar';

/**
 * Page top bar (Twenty style): icon, breadcrumb and title on one fixed-height line, actions on the right.
 * It is rendered into the shell's bar, outside the scrolling body, so it never scrolls and spans the card.
 * The subtitle is shown at the top of the page body.
 */
export function PageHeader({ title, subtitle, actions, crumb, icon }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; crumb?: ReactNode; icon?: string }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => setSlot(document.getElementById(PAGE_BAR_ID)), []);
  const bar = (
    <div className="page-header">
      <div className="page-title">
        {icon && <Icon name={icon} />}
        {crumb && (
          <>
            <span className="crumb">{crumb}</span>
            <span className="crumb-sep">/</span>
          </>
        )}
        <h1>{title}</h1>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
  return (
    <>
      {slot ? createPortal(bar, slot) : null}
      {subtitle && <div className="page-sub">{subtitle}</div>}
    </>
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

/** Centered dialog (fixed overlay, so it never moves the page). Esc or the backdrop closes it. */
export function Modal({ title, children, footer, onClose, wide }: { title: ReactNode; children: ReactNode; footer?: ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={wide ? 'modal wide' : 'modal'} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        <div className="modal-head">
          <div className="modal-title">{title}</div>
          <button type="button" className="icon-btn" aria-label="Đóng" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
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
