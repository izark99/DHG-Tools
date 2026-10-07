// Field descriptions and the input for one field of a config object (used by GridEditor).
import type { ScopeInfo } from '../../engine/formula/analyze';
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
  /** grid: shown only in the expandable detail row */
  detail?: boolean;
  /** grid: short column header (full label in the tooltip) */
  short?: string;
  /** grid: help shown on hover of the column header */
  help?: string;
  /** grid: column width in px */
  w?: number;
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
