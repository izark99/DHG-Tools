// Generic editor for arrays of config objects: each item is a block with simple fields on top
// and formula fields full width below.
import { useState, type ReactNode } from 'react';
import { analyzeFormula, type ScopeInfo } from '../../engine/formula/analyze';
import type { ConfigError } from '../../engine/validate';
import { FormulaInput } from './FormulaInput';

export type Opt = string | { value: string; label: string };

export interface Field {
  key: string;
  label: string;
  kind: 'text' | 'number' | 'bool' | 'select' | 'formula' | 'aliases' | 'lines';
  options?: Opt[];
  /** select: allow empty (stored as null) */
  nullable?: boolean;
  /** formula scope for this item */
  info?: (item: Record<string, unknown>, index: number) => ScopeInfo | null;
  optional?: boolean;
  /** bool: value used when the property is absent */
  default?: boolean;
  wide?: boolean;
  placeholder?: string;
}

const optValue = (o: Opt) => (typeof o === 'string' ? o : o.value);
const optLabel = (o: Opt) => (typeof o === 'string' ? o : o.label);

export function FieldInput({ f, value, onChange, item, index }: { f: Field; value: unknown; onChange: (v: unknown) => void; item: Record<string, unknown>; index: number }) {
  switch (f.kind) {
    case 'bool':
      return <input type="checkbox" checked={value === undefined || value === null ? !!f.default : !!value} onChange={(e) => onChange(e.target.checked)} />;
    case 'number':
      return <input type="number" value={value === null || value === undefined ? '' : String(value)} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />;
    case 'select': {
      const opts = f.options ?? [];
      const v = value === null || value === undefined ? '' : String(value);
      const known = opts.some((o) => optValue(o) === v);
      return (
        <select value={v} onChange={(e) => onChange(e.target.value === '' && f.nullable ? null : e.target.value)}>
          {(f.nullable || !known) && <option value="">{v && !known ? `${v} (không có!)` : '—'}</option>}
          {opts.map((o) => (
            <option key={optValue(o)} value={optValue(o)}>
              {optLabel(o)}
            </option>
          ))}
        </select>
      );
    }
    case 'aliases':
      return (
        <input
          value={Array.isArray(value) ? value.join(' | ') : ''}
          placeholder="tiêu đề 1 | tiêu đề 2"
          onChange={(e) =>
            onChange(
              e.target.value
                .split('|')
                .map((s) => s.trim())
                .filter((s, i, arr) => s || i === arr.length - 1),
            )
          }
          onBlur={(e) =>
            onChange(
              e.target.value
                .split('|')
                .map((s) => s.trim())
                .filter(Boolean),
            )
          }
        />
      );
    case 'lines':
      return (
        <textarea
          rows={3}
          value={Array.isArray(value) ? value.join('\n') : ''}
          placeholder={f.placeholder}
          onChange={(e) => onChange(e.target.value.split('\n'))}
        />
      );
    case 'formula':
      return <FormulaInput value={value as string} onChange={onChange} info={f.info ? f.info(item, index) : null} optional={f.optional} placeholder={f.placeholder} />;
    default:
      return <input value={value === null || value === undefined ? '' : String(value)} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} />;
  }
}

export function ListEditor<T extends object>({
  items,
  onChange,
  fields,
  make,
  errors,
  path,
  title,
  extra,
  addLabel = '+ Thêm',
}: {
  items: T[];
  onChange: (items: T[]) => void;
  fields: Field[];
  make: () => T;
  errors?: ConfigError[];
  path?: string;
  title?: (item: T, i: number) => ReactNode;
  extra?: (item: T, i: number, update: (patch: Partial<T>) => void) => ReactNode;
  addLabel?: string;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const update = (i: number, patch: Partial<T>) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const n = items.slice();
    [n[i], n[j]] = [n[j], n[i]];
    onChange(n);
  };
  const simple = fields.filter((f) => f.kind !== 'formula' && !f.wide);
  const wide = fields.filter((f) => f.kind === 'formula' || f.wide);
  return (
    <div className="list-editor">
      {items.map((item, i) => {
        const rec = item as unknown as Record<string, unknown>;
        // formula errors are already shown under each formula field
        const shown = new Set<string>(['Thiếu công thức']);
        for (const f of wide)
          if (f.kind === 'formula' && f.info) {
            const v = rec[f.key];
            const info = f.info(rec, i);
            if (info && typeof v === 'string' && v.trim()) for (const m of analyzeFormula(v, info).errors) shown.add(m);
          }
        const errs = path
          ? (errors ?? []).filter(
              (e) => (e.path === `${path}[${i}]` || e.path.startsWith(`${path}[${i}] `) || e.path.startsWith(`${path}[${i}].`)) && !shown.has(e.message),
            )
          : [];
        return (
          <div key={i} className={errs.length ? 'item has-error' : 'item'}>
            <div className="item-head">
              <span className="muted small">#{i + 1}</span>
              <strong>{title ? title(item, i) : String(rec.id ?? '')}</strong>
              <span className="spacer" />
              {extra && (
                <button type="button" className="link small" onClick={() => setOpen(open === i ? null : i)}>
                  {open === i ? 'thu gọn' : 'chi tiết'}
                </button>
              )}
              <button type="button" className="link small" onClick={() => move(i, -1)} title="Lên">
                ↑
              </button>
              <button type="button" className="link small" onClick={() => move(i, 1)} title="Xuống">
                ↓
              </button>
              <button
                type="button"
                className="link small danger-text"
                title="Xoá"
                onClick={() => {
                  if (confirm('Xoá mục này?')) onChange(items.filter((_, j) => j !== i));
                }}
              >
                ✕
              </button>
            </div>
            <div className="item-fields">
              {simple.map((f) => (
                <label key={f.key} className={f.kind === 'bool' ? 'check' : undefined}>
                  {f.kind !== 'bool' && <span>{f.label}</span>}
                  <FieldInput f={f} value={rec[f.key]} item={rec} index={i} onChange={(v) => update(i, { [f.key]: v } as Partial<T>)} />
                  {f.kind === 'bool' && <span>{f.label}</span>}
                </label>
              ))}
            </div>
            {wide.map((f) => (
              <label key={f.key} className="wide">
                <span>{f.label}</span>
                <FieldInput f={f} value={rec[f.key]} item={rec} index={i} onChange={(v) => update(i, { [f.key]: v } as Partial<T>)} />
              </label>
            ))}
            {errs.length > 0 && (
              <div className="ferr">
                {errs.map((e, k) => (
                  <div key={k}>{e.message}</div>
                ))}
              </div>
            )}
            {extra && open === i && <div className="item-extra">{extra(item, i, (p) => update(i, p))}</div>}
          </div>
        );
      })}
      <button type="button" onClick={() => onChange([...items, make()])}>
        {addLabel}
      </button>
    </div>
  );
}
