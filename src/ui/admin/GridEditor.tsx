// Spreadsheet-like editor for arrays of config objects: one row per item, every field edited in its
// cell, drag the ⠿ handle (or focus it and press ↑ / ↓) to reorder, rarely used fields and nested
// lists in an expandable detail row, rows with errors marked red with the message underneath, and
// an optional "sample value" column computed from a sample payroll file.
import { Fragment, useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import { analyzeFormula } from '../../engine/formula/analyze';
import type { ConfigError } from '../../engine/validate';
import { Icon } from '../layout';
import { FieldInput, type Field } from './fields';

export function GridEditor<T extends object>({
  items,
  onChange,
  fields,
  make,
  errors,
  path,
  title,
  extra,
  addLabel = 'Thêm dòng',
  sample,
  sampleLabel = 'Giá trị mẫu',
  focus,
  empty = 'Chưa có dòng nào.',
  defaultOpen,
  sampleWidth = 170,
  sampleIn,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  fields: Field[];
  make: () => T;
  errors?: ConfigError[];
  path?: string;
  title?: (item: T, i: number) => ReactNode;
  /** content of the expandable detail row (nested lists…) */
  extra?: (item: T, i: number, update: (patch: Partial<T>) => void) => ReactNode;
  addLabel?: string;
  /** value computed from the sample data for this row */
  sample?: (item: T, i: number) => ReactNode;
  sampleLabel?: string;
  /** row to scroll to and flash (from the overview) */
  focus?: number | null;
  empty?: string;
  /** open every detail row at first (short lists whose detail is the main content) */
  defaultOpen?: boolean;
  sampleWidth?: number;
  /** show the sample value under this field's input (a formula) instead of in its own column */
  sampleIn?: string;
}) {
  const [open, setOpen] = useState<Set<number>>(() => new Set(defaultOpen ? items.map((_, i) => i) : []));
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const [flash, setFlash] = useState<number | null>(null);
  const body = useRef<HTMLTableSectionElement>(null);

  const main = fields.filter((f) => !f.detail);
  const detail = fields.filter((f) => f.detail);
  const expandable = detail.length > 0 || !!extra;
  const sampleCol = !!sample && !sampleIn;
  // tables without a formula column scroll sideways when narrow; formula tables never do, so the
  // autocomplete list under a formula is not clipped
  const scroll = !main.some((f) => f.kind === 'formula');
  const minWidth = 28 + 34 + 84 + (sampleCol ? sampleWidth : 0) + main.reduce((n, f) => n + (f.w ?? (f.kind === 'bool' ? 64 : 170)), 0);
  const cols = 3 + main.length + (sampleCol ? 1 : 0);

  useEffect(() => {
    if (focus === null || focus === undefined || !body.current) return;
    const row = body.current.querySelector<HTMLElement>(`tr[data-row="${focus}"]`);
    row?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setFlash(focus);
    const t = setTimeout(() => setFlash(null), 1600);
    return () => clearTimeout(t);
  }, [focus]);

  const update = (i: number, patch: Partial<T>) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return;
    const n = items.slice();
    const [x] = n.splice(from, 1);
    n.splice(to, 0, x);
    setOpen(new Set());
    onChange(n);
  };
  const duplicate = (i: number) => {
    const copy = structuredClone(items[i]) as Record<string, unknown>;
    for (const k of ['id', 'helper'])
      if (typeof copy[k] === 'string' && copy[k]) {
        let name = `${copy[k]}_copy`;
        while (items.some((x) => (x as Record<string, unknown>)[k] === name)) name += '_';
        copy[k] = name;
      }
    const n = items.slice();
    n.splice(i + 1, 0, copy as T);
    setOpen(new Set());
    onChange(n);
  };
  const remove = (i: number) => {
    const label = title ? title(items[i], i) : `dòng ${i + 1}`;
    if (!confirm(`Xoá ${typeof label === 'string' ? `"${label}"` : `dòng ${i + 1}`}?`)) return;
    setOpen(new Set());
    onChange(items.filter((_, j) => j !== i));
  };

  const rowErrors = (item: T, i: number) => {
    if (!path || !errors) return [];
    const rec = item as unknown as Record<string, unknown>;
    // formula errors are already shown under the formula cell
    const shown = new Set<string>(['Thiếu công thức']);
    for (const f of fields)
      if (f.kind === 'formula' && f.info) {
        const v = rec[f.key];
        const info = f.info(rec, i);
        if (info && typeof v === 'string' && v.trim()) for (const m of analyzeFormula(v, info).errors) shown.add(m);
      }
    return errors.filter((e) => (e.path === `${path}[${i}]` || e.path.startsWith(`${path}[${i}] `) || e.path.startsWith(`${path}[${i}].`)) && !shown.has(e.message));
  };

  const onDragOver = (e: DragEvent, i: number) => {
    if (!drag) return;
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const after = e.clientY > r.top + r.height / 2;
    let to = after ? i + 1 : i;
    if (to > drag.from) to -= 1;
    if (to !== drag.to) setDrag({ ...drag, to });
  };
  const handleKey = (e: KeyboardEvent, i: number) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const to = e.key === 'ArrowUp' ? i - 1 : i + 1;
      move(i, to);
      // keep the keyboard focus on the moved row's handle
      requestAnimationFrame(() => body.current?.querySelector<HTMLElement>(`tr[data-row="${to}"] .grid-handle`)?.focus());
    }
  };

  return (
    <div className="grid-editor">
      <div className={scroll ? 'table-wrap ge-scroll' : 'table-wrap'}>
        <table className="grid ge" style={scroll ? { minWidth } : undefined}>
          <thead>
            <tr>
              <th className="ge-handle-col" aria-label="Thứ tự" />
              <th className="ge-no">#</th>
              {main.map((f) => (
                <th
                  key={f.key}
                  title={f.help ? `${f.label}: ${f.help}` : f.label}
                  style={f.w ? { width: f.w } : undefined}
                  className={[f.kind === 'formula' ? 'ge-formula-col' : f.kind === 'bool' ? 'ge-bool-col' : '', f.help ? 'has-help' : ''].filter(Boolean).join(' ') || undefined}
                >
                  {f.short ?? f.label}
                </th>
              ))}
              {sampleCol && (
                <th className="ge-sample-col" style={{ width: sampleWidth }} title="Tính trên dữ liệu mẫu đang nạp">
                  {sampleLabel}
                </th>
              )}
              <th className="ge-actions-col" aria-label="Thao tác" />
            </tr>
          </thead>
          <tbody ref={body}>
            {items.map((item, i) => {
              const rec = item as unknown as Record<string, unknown>;
              const errs = rowErrors(item, i);
              const isOpen = open.has(i);
              const dropBefore = drag && drag.to === i && drag.from > i;
              const dropAfter = drag && drag.to === i && drag.from < i;
              const cls = [
                errs.length ? 'ge-error' : '',
                drag?.from === i ? 'ge-dragging' : '',
                dropBefore ? 'ge-drop-before' : '',
                dropAfter ? 'ge-drop-after' : '',
                flash === i ? 'ge-flash' : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <Fragment key={i}>
                  <tr data-row={i} className={cls || undefined} onDragOver={(e) => onDragOver(e, i)} onDrop={(e) => (e.preventDefault(), drag && move(drag.from, drag.to), setDrag(null))}>
                    <td className="ge-handle-col">
                      <button
                        type="button"
                        className="grid-handle"
                        draggable
                        title="Kéo để đổi thứ tự (hoặc bấm vào rồi dùng phím ↑ / ↓)"
                        aria-label={`Đổi thứ tự dòng ${i + 1}`}
                        onDragStart={(e) => {
                          const tr = (e.currentTarget as HTMLElement).closest('tr');
                          if (tr) e.dataTransfer.setDragImage(tr, 12, 12);
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', String(i));
                          setDrag({ from: i, to: i });
                        }}
                        onDragEnd={() => setDrag(null)}
                        onKeyDown={(e) => handleKey(e, i)}
                      >
                        ⠿
                      </button>
                    </td>
                    <td className="ge-no" data-no-text-edit="">{i + 1}</td>
                    {main.map((f) => (
                      <td key={f.key} className={f.kind === 'formula' ? 'ge-formula-col' : f.kind === 'bool' ? 'ge-bool-col' : undefined}>
                        <FieldInput f={f} value={rec[f.key]} item={rec} index={i} onChange={(v) => update(i, { [f.key]: v } as Partial<T>)} />
                        {sample && sampleIn === f.key && (
                          <div className="ge-sample-in" title={sampleLabel} data-no-text-edit="">
                            <span className="ge-sample-eq">=</span>
                            {sample(item, i)}
                          </div>
                        )}
                      </td>
                    ))}
                    {sampleCol && (
                      <td className="ge-sample-col" data-no-text-edit="">
                        {sample(item, i)}
                      </td>
                    )}
                    <td className="ge-actions-col">
                      <div className="ge-actions">
                        {expandable && (
                          <button
                            type="button"
                            className={isOpen ? 'icon-btn on' : 'icon-btn'}
                            title={isOpen ? 'Thu gọn' : 'Chi tiết'}
                            aria-label={isOpen ? 'Thu gọn' : 'Chi tiết'}
                            aria-expanded={isOpen}
                            onClick={() => setOpen((s) => (s.has(i) ? new Set([...s].filter((x) => x !== i)) : new Set([...s, i])))}
                          >
                            <span className={isOpen ? 'ge-caret open' : 'ge-caret'}>
                              <Icon name="chevron" size={14} />
                            </span>
                          </button>
                        )}
                        <button type="button" className="icon-btn" title="Nhân bản dòng" aria-label="Nhân bản dòng" onClick={() => duplicate(i)}>
                          <Icon name="copy" size={14} />
                        </button>
                        <button type="button" className="icon-btn danger-icon" title="Xoá dòng" aria-label="Xoá dòng" onClick={() => remove(i)}>
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {errs.length > 0 && (
                    <tr className="ge-error-row">
                      <td colSpan={cols}>
                        {errs.map((e, k) => (
                          <div key={k}>
                            <Icon name="alert" size={14} /> {e.message}
                          </div>
                        ))}
                      </td>
                    </tr>
                  )}
                  {isOpen && (
                    <tr className="ge-detail-row">
                      <td colSpan={cols}>
                        {detail.length > 0 && (
                          <div className="item-fields">
                            {detail.map((f) => (
                              <label key={f.key} className={f.kind === 'bool' ? 'check' : f.kind === 'formula' || f.wide ? 'ge-wide' : undefined}>
                                {f.kind !== 'bool' && <span>{f.label}</span>}
                                <FieldInput f={f} value={rec[f.key]} item={rec} index={i} onChange={(v) => update(i, { [f.key]: v } as Partial<T>)} />
                                {f.kind === 'bool' && <span>{f.label}</span>}
                              </label>
                            ))}
                          </div>
                        )}
                        {extra && <div className="ge-extra">{extra(item, i, (p) => update(i, p))}</div>}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!items.length && (
              <tr>
                <td colSpan={cols} className="ge-empty">
                  {empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <button type="button" className="ge-add" onClick={() => onChange([...items, make()])}>
        <Icon name="plus" size={14} /> {addLabel}
      </button>
    </div>
  );
}
