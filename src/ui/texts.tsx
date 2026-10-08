// Interface texts that admins edit in place.
//   <T k="home.title">Chọn flow để chạy</T>   text with a built-in default (children)
//   <Guide k="home.guide" />                   instruction block, hidden while empty
//   any other text on screen                   <AutoTexts /> lets the admin click it and replace it:
//                                              stored as "lit.<hash>" = {"from","to"} and applied to
//                                              every text node (and placeholder / title) equal to "from".
//                                              Data areas are marked data-no-text-edit and left alone.
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

// ---- literal overrides ("lit.<hash>") ----
export const LIT_PREFIX = 'lit.';
export const normText = (s: string) => s.replace(/\s+/g, ' ').trim();
/** Stable key for a literal text (two FNV-1a 32-bit hashes). */
export function litKey(text: string): string {
  const t = normText(text);
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ t.length;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return LIT_PREFIX + a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}
export function parseLit(v: string | undefined): { from: string; to: string } | null {
  if (!v) return null;
  try {
    const o = JSON.parse(v);
    return typeof o?.from === 'string' && typeof o?.to === 'string' ? o : null;
  } catch {
    return null;
  }
}
let litMap = new Map<string, string>();
function rebuildLit() {
  const m = new Map<string, string>();
  for (const [k, v] of Object.entries(texts))
    if (k.startsWith(LIT_PREFIX)) {
      const o = parseLit(v);
      if (o) m.set(normText(o.from), o.to);
    }
  litMap = m;
}

// ---- store ----
let texts: Record<string, string> = {};
let canEdit = false;
let editMode = false;
let editing: Editing | null = null;
let version = 0;
const subs = new Set<() => void>();
const emit = () => {
  rebuildLit();
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

/** Replace a literal text everywhere (used by the Giao diện page for texts that cannot be clicked). */
export async function saveLiteral(from: string, to: string): Promise<void> {
  const f = normText(from);
  const key = litKey(f);
  const r = await api.putText(key, JSON.stringify({ from: f, to }));
  texts = { ...texts, [key]: r.value };
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
  const lit = cur.key.startsWith(LIT_PREFIX);
  const [draft, setDraft] = useState(() => (lit ? (parseLit(texts[cur.key])?.to ?? cur.fallback) : (texts[cur.key] ?? cur.fallback)));
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
        const r = await api.putText(cur.key, lit ? JSON.stringify({ from: cur.fallback, to: draft }) : draft);
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
          {lit ? <span className="muted small">áp dụng cho mọi chỗ có đúng chữ này</span> : <code>{cur.key}</code>}
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
      <span title="Bấm vào bất kỳ chữ nào để sửa (chữ có viền nét đứt, hoặc chữ được khung khi rê chuột). Alt+bấm để mở link / bấm nút như thường. Thay đổi áp dụng cho mọi người dùng.">
        Chỉnh sửa giao diện: bấm vào chữ bất kỳ để sửa · Alt+bấm để dùng nút / link
      </span>
      <button type="button" className="primary" onClick={() => setEditMode(false)}>
        Xong
      </button>
    </div>
  );
}

// ---- every other text on screen ----------------------------------------------------------------

const SKIP = 'script,style,textarea,input,select,code,pre,[contenteditable="true"],[data-no-text-edit],.text-editor,.text-editor-backdrop,.edit-bar,[data-text-key],.lit-hover';
const ATTRS = ['placeholder', 'title'] as const;
/** text we wrote into a node, and the text React had put there */
const shownText = new WeakMap<Text, string>();
const origText = new WeakMap<Text, string>();
const origAttr = new WeakMap<Element, Record<string, { orig: string; shown: string }>>();

const worthy = (s: string) => /\p{L}/u.test(s);
function skipped(el: Element | null): boolean {
  return !el || !!el.closest(SKIP);
}
/** The text the app put in this node (before any override of ours). */
function originalOf(node: Text): string {
  const cur = node.nodeValue ?? '';
  return shownText.get(node) === cur && origText.has(node) ? origText.get(node)! : cur;
}
function applyText(node: Text) {
  const cur = node.nodeValue ?? '';
  const ours = shownText.get(node) === cur && origText.has(node);
  const original = ours ? origText.get(node)! : cur;
  const n = normText(original);
  const to = n && worthy(n) && !skipped(node.parentElement) ? litMap.get(n) : undefined;
  if (to !== undefined) {
    const next = (/^\s*/.exec(original)?.[0] ?? '') + to + (/\s*$/.exec(original)?.[0] ?? '');
    origText.set(node, original);
    shownText.set(node, next);
    if (cur !== next) node.nodeValue = next;
  } else if (ours) {
    node.nodeValue = original;
    origText.delete(node);
    shownText.delete(node);
  }
}
function applyAttrs(el: Element) {
  let rec = origAttr.get(el);
  for (const a of ATTRS) {
    const cur = el.getAttribute(a);
    if (cur === null) continue;
    const mine = rec?.[a];
    const original = mine && mine.shown === cur ? mine.orig : cur;
    const to = worthy(original) && !skipped(el.parentElement) ? litMap.get(normText(original)) : undefined;
    if (to !== undefined) {
      rec = rec ?? {};
      rec[a] = { orig: original, shown: to };
      origAttr.set(el, rec);
      if (cur !== to) el.setAttribute(a, to);
    } else if (mine && mine.shown === cur) {
      el.setAttribute(a, original);
      delete rec![a];
    }
  }
}
function applyTree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return applyText(root as Text);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  if (el.closest('[data-no-text-edit]')) return;
  applyAttrs(el);
  const w = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.nodeType === Node.ELEMENT_NODE && (n as Element).hasAttribute('data-no-text-edit') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) applyText(n as Text);
    else applyAttrs(n as Element);
  }
}

/** The text node right under the pointer (only if the pointer is really on its glyphs). */
function textAt(x: number, y: number): Text | null {
  const d = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node } | null };
  const node = d.caretRangeFromPoint ? d.caretRangeFromPoint(x, y)?.startContainer : d.caretPositionFromPoint?.(x, y)?.offsetNode;
  if (!node || node.nodeType !== Node.TEXT_NODE || !worthy(node.nodeValue ?? '')) return null;
  const r = document.createRange();
  r.selectNodeContents(node);
  for (const b of r.getClientRects()) if (x >= b.left - 2 && x <= b.right + 2 && y >= b.top - 2 && y <= b.bottom + 2) return node as Text;
  return null;
}
function rectOf(node: Text): DOMRect {
  const r = document.createRange();
  r.selectNodeContents(node);
  return r.getBoundingClientRect();
}

/**
 * Mounted once in the shell: applies the literal overrides to everything React renders, and in edit
 * mode outlines the text under the pointer and opens the editor on click.
 */
export function AutoTexts() {
  const { editMode: on } = useStore();
  const [hover, setHover] = useState<{ rect: DOMRect; changed: boolean } | null>(null);

  // apply now and after every change of the overrides or of the page
  useEffect(() => {
    applyTree(document.body);
  }, [version]);
  useEffect(() => {
    const pending = new Set<Node>();
    let frame = 0;
    const flush = () => {
      frame = 0;
      for (const n of pending) if (n.isConnected) applyTree(n);
      pending.clear();
    };
    const mo = new MutationObserver((muts) => {
      if (!litMap.size) return;
      for (const m of muts) {
        if (m.type === 'characterData') pending.add(m.target);
        else if (m.type === 'attributes') pending.add(m.target);
        else m.addedNodes.forEach((n) => pending.add(n));
      }
      if (!frame) frame = requestAnimationFrame(flush);
    });
    mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
    return () => {
      mo.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (!on) {
      setHover(null);
      return;
    }
    const target = (e: MouseEvent | globalThis.MouseEvent) => {
      const t = e.target as Element | null;
      if (!t || t.closest(SKIP) || t.closest('input,select,textarea,label.button')) return null;
      const node = textAt(e.clientX, e.clientY);
      return node && !skipped(node.parentElement) ? node : null;
    };
    let frame = 0;
    const move = (e: globalThis.MouseEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const node = editing ? null : target(e);
        setHover(node ? { rect: rectOf(node), changed: litMap.has(normText(originalOf(node))) } : null);
      });
    };
    const click = (e: globalThis.MouseEvent) => {
      if (e.altKey || editing) return;
      const node = target(e);
      if (!node) return;
      e.preventDefault();
      e.stopPropagation();
      const original = normText(originalOf(node));
      editing = {
        key: litKey(original),
        fallback: original,
        multiline: original.length > 80,
        rect: rectOf(node),
        hint: /\d/.test(original) ? 'Chữ có chứa số: chỉ thay ở những chỗ có đúng nguyên văn này.' : undefined,
      };
      setHover(null);
      emit();
    };
    const leave = () => setHover(null);
    document.addEventListener('mousemove', move, true);
    document.addEventListener('click', click, true);
    document.addEventListener('scroll', leave, true);
    return () => {
      document.removeEventListener('mousemove', move, true);
      document.removeEventListener('click', click, true);
      document.removeEventListener('scroll', leave, true);
      cancelAnimationFrame(frame);
    };
  }, [on]);

  if (!on || !hover) return null;
  const r = hover.rect;
  return createPortal(
    <div className={hover.changed ? 'lit-hover changed' : 'lit-hover'} style={{ top: r.top - 2, left: r.left - 3, width: r.width + 6, height: r.height + 4 }} aria-hidden="true" />,
    document.body,
  );
}
