// Interface texts that admins edit in place.
//   <T k="home.title">Chọn flow để chạy</T>   text with a built-in default (children)
//   <Guide k="home.guide" />                   instruction block, hidden while empty
// Admin turns on "Chỉnh sửa giao diện": every editable text gets a dashed outline (outline only, so
// nothing moves) and a click opens a small editor. Saved texts go to the server and apply to everyone;
// "Khôi phục mặc định" deletes the override. Texts are rendered as plain text, never as HTML.
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { api, errMsg } from '../api';
import { Icon, toast } from './layout';

type Vars = Record<string, string | number>;
interface Editing {
  key: string;
  fallback: string;
  multiline: boolean;
  rect: DOMRect;
  hint?: string;
}

// ---- store ----
let texts: Record<string, string> = {};
let canEdit = false;
let editMode = false;
let editing: Editing | null = null;
let version = 0;
const subs = new Set<() => void>();
const emit = () => {
  version++;
  subs.forEach((f) => f());
};
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};
const MODE_KEY = 'cb-forms.edit-texts';

function useStore() {
  useSyncExternalStore(subscribe, () => version);
  return { texts, editMode: canEdit && editMode, editing };
}

/** Load the texts this session may read (before login: login / brand texts only). */
export async function loadTexts(): Promise<void> {
  try {
    texts = (await api.texts()).texts;
    emit();
  } catch {
    /* keep the built-in defaults */
  }
}

/** Called by the shell with the signed-in user's role. */
export function setTextAdmin(admin: boolean) {
  if (canEdit === admin) return;
  canEdit = admin;
  if (admin) {
    try {
      editMode = sessionStorage.getItem(MODE_KEY) === '1';
    } catch {
      editMode = false;
    }
  } else {
    editMode = false;
    editing = null;
  }
  emit();
}

export function setEditMode(on: boolean) {
  editMode = on && canEdit;
  if (!editMode) editing = null;
  try {
    sessionStorage.setItem(MODE_KEY, editMode ? '1' : '0');
  } catch {
    /* per-tab convenience only */
  }
  emit();
}

/** Every override saved on the server (key → text). */
export function useSavedTexts(): Record<string, string> {
  return useStore().texts;
}

/** Delete an override (back to the built-in default). */
export async function resetText(key: string): Promise<void> {
  await api.deleteText(key);
  dropText(key);
  emit();
}

export function useEditMode(): boolean {
  return useStore().editMode;
}

const fill = (s: string, vars?: Vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s);

/** Plain-string version for attributes (placeholder, title); not editable in place. */
export function useText(key: string, fallback: string, vars?: Vars): string {
  const { texts: t } = useStore();
  return fill(t[key] ?? fallback, vars);
}

function open(e: MouseEvent, key: string, fallback: string, multiline: boolean, hint?: string) {
  if (e.altKey) return; // Alt+click: use the link / button underneath as usual
  e.preventDefault();
  e.stopPropagation();
  editing = { key, fallback, multiline, rect: (e.currentTarget as HTMLElement).getBoundingClientRect(), hint };
  emit();
}

/**
 * For a link or button whose label is an editable text (sidebar items): in edit mode a click anywhere
 * on it edits the label instead of following the link (Alt+click still follows it).
 */
export function editOnClick(key: string, fallback: string) {
  return (e: MouseEvent) => {
    if (canEdit && editMode) open(e, key, fallback, false);
  };
}

/** Editable text. `children` is the built-in default; `{name}` placeholders are filled from `vars`. */
export function T({ k, children, vars, multiline = false }: { k: string; children: string; vars?: Vars; multiline?: boolean }) {
  const { texts: t, editMode: on, editing: cur } = useStore();
  const value = fill(t[k] ?? children, vars);
  if (!on) return <>{value}</>;
  const hint = vars ? `Có thể dùng: ${Object.keys(vars).map((v) => `{${v}}`).join(', ')}` : undefined;
  return (
    <span
      className={`ui-text${cur?.key === k ? ' active' : ''}${k in t ? ' changed' : ''}`}
      data-text-key={k}
      role="button"
      tabIndex={0}
      title={`Sửa văn bản (${k})`}
      onClick={(e) => open(e, k, children, multiline, hint)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') open(e as unknown as MouseEvent, k, children, multiline, hint);
      }}
    >
      {value || <span className="ui-text-empty">(trống)</span>}
    </span>
  );
}

/** Render guide text: blank line = new paragraph; consecutive lines starting with "- " = bullet list. */
function GuideBody({ text }: { text: string }) {
  const bullet = /^\s*[-•]\s+/;
  const parts: { list: boolean; lines: string[] }[] = [];
  for (const block of text.split(/\n\s*\n/)) {
    let cur: { list: boolean; lines: string[] } | null = null;
    for (const line of block.split('\n')) {
      const list = bullet.test(line);
      if (!cur || cur.list !== list) parts.push((cur = { list, lines: [] }));
      cur.lines.push(list ? line.replace(bullet, '') : line);
    }
  }
  return (
    <>
      {parts.map((p, i) =>
        p.list ? (
          <ul key={i}>
            {p.lines.map((l, j) => (
              <li key={j}>{l}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>
            {p.lines.map((l, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {l}
              </span>
            ))}
          </p>
        ),
      )}
    </>
  );
}

/** Instruction block for a page (or a flow). Empty by default; admins add the text in edit mode. */
export function Guide({ k, fallback = '', addLabel = 'Thêm hướng dẫn cho trang này' }: { k: string; fallback?: string; addLabel?: string }) {
  const { texts: t, editMode: on, editing: cur } = useStore();
  const value = t[k] ?? fallback;
  if (!value.trim() && !on) return null;
  const hint = 'Dòng trống = đoạn mới. Dòng bắt đầu bằng "- " = gạch đầu dòng.';
  if (!value.trim())
    return (
      <button type="button" className={`guide-add${cur?.key === k ? ' active' : ''}`} data-text-key={k} onClick={(e) => open(e, k, fallback, true, hint)}>
        <Icon name="plus" size={16} /> {addLabel}
      </button>
    );
  return (
    <div
      className={`guide${on ? ' ui-text' : ''}${cur?.key === k ? ' active' : ''}`}
      data-text-key={k}
      {...(on ? { role: 'button', tabIndex: 0, title: `Sửa hướng dẫn (${k})`, onClick: (e: MouseEvent) => open(e, k, fallback, true, hint) } : {})}
    >
      <Icon name="info" />
      <div className="guide-text">
        <GuideBody text={value} />
      </div>
    </div>
  );
}

/** Floating editor (one for the whole app). Fixed position: opening it never moves the page. */
export function TextEditor() {
  const { editing: cur } = useStore();
  useEffect(() => {
    if (!cur) return;
    const close = () => {
      editing = null;
      emit();
    };
    window.addEventListener('resize', close);
    return () => window.removeEventListener('resize', close);
  }, [cur]);
  if (!cur) return null;
  return createPortal(<EditorBox key={cur.key} cur={cur} />, document.body);
}

function dropText(key: string) {
  const next = { ...texts };
  delete next[key];
  texts = next;
}

function EditorBox({ cur }: { cur: Editing }) {
  const [draft, setDraft] = useState(() => texts[cur.key] ?? cur.fallback);
  const [busy, setBusy] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const changed = cur.key in texts;

  useLayoutEffect(() => {
    if (!box.current) return;
    const w = box.current.offsetWidth;
    const h = box.current.offsetHeight;
    const r = cur.rect;
    let top = r.bottom + 8;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 8);
    const left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
    setPos({ top, left });
    input.current?.focus();
    input.current?.select();
  }, [cur]);

  const close = () => {
    editing = null;
    emit();
  };
  const run = async (what: 'save' | 'reset') => {
    setBusy(true);
    try {
      if (what === 'reset' || draft === cur.fallback) {
        if (changed) await api.deleteText(cur.key);
        dropText(cur.key);
      } else {
        const r = await api.putText(cur.key, draft);
        texts = { ...texts, [cur.key]: r.value };
      }
      editing = null;
      emit();
      toast('ok', what === 'reset' ? 'Đã khôi phục văn bản mặc định.' : 'Đã lưu văn bản.');
    } catch (e) {
      toast('error', errMsg(e));
      setBusy(false);
    }
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Enter' && (!cur.multiline || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void run('save');
    }
  };

  return (
    <>
      <div className="text-editor-backdrop" onClick={close} />
      <div ref={box} className="text-editor" style={pos ?? { top: -9999, left: -9999 }} role="dialog" aria-label="Sửa văn bản">
        <div className="text-editor-head">
          <span>Sửa văn bản</span>
          <code>{cur.key}</code>
        </div>
        <textarea ref={input} rows={cur.multiline ? 6 : 2} value={draft} maxLength={4000} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} aria-label="Nội dung" />
        <div className="text-editor-hint">
          {cur.hint && <div>{cur.hint}</div>}
          <div>{cur.multiline ? 'Ctrl+Enter để lưu, Esc để huỷ.' : 'Enter để lưu, Esc để huỷ.'}</div>
          {cur.fallback && (
            <div className="text-editor-default" title={cur.fallback}>
              Mặc định: {cur.fallback}
            </div>
          )}
        </div>
        <div className="text-editor-actions">
          <button type="button" className="link" disabled={busy || !changed} onClick={() => run('reset')}>
            Khôi phục mặc định
          </button>
          <span className="grow" />
          <button type="button" onClick={close} disabled={busy}>
            Huỷ
          </button>
          <button type="button" className="primary" onClick={() => run('save')} disabled={busy}>
            Lưu
          </button>
        </div>
      </div>
    </>
  );
}

/** Floating bar shown while edit mode is on (fixed, so it never shifts the layout). */
export function EditModeBar() {
  const on = useEditMode();
  if (!on) return null;
  return (
    <div className="edit-bar" role="status">
      <Icon name="pen" size={16} />
      <span title="Bấm vào chữ có viền nét đứt để sửa. Alt+bấm để mở link / bấm nút như thường. Thay đổi áp dụng cho mọi người dùng.">Chỉnh sửa giao diện: bấm chữ có viền để sửa · Alt+bấm để mở link</span>
      <button type="button" className="primary" onClick={() => setEditMode(false)}>
        Xong
      </button>
    </div>
  );
}
