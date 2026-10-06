// Formula field with reference autocomplete and live validation.
import { useMemo, useRef, useState } from 'react';
import { analyzeFormula, type ScopeInfo } from '../../engine/formula/analyze';
import { FUNCTIONS } from '../../engine/formula/evaluator';

function suggestions(info: ScopeInfo): string[] {
  const out: string[] = Object.keys(FUNCTIONS)
    .filter((f) => {
      const s = FUNCTIONS[f].scopes;
      return !s || s.includes(info.scope);
    })
    .map((f) => `${f}(`);
  for (const c of info.columns) out.push(`[${c}]`);
  if (info.scope === 'employee' || info.scope === 'total' || info.empColumns)
    for (const [inp, fields] of Object.entries(info.inputs)) for (const f of fields) out.push(`in.${inp}.${f}`);
  for (const p of info.params ?? []) out.push(`P.${p}`);
  for (const r of info.run) out.push(`run.${r}`);
  for (const f of info.rowFields ?? []) out.push(`row.${f}`);
  for (const c of info.empColumns ?? []) out.push(`emp.${c}`);
  for (const [k, cols] of Object.entries(info.formColumns ?? {})) for (const c of cols) out.push(`${k}.${c}`);
  if (info.tables) for (const t of Object.keys(info.tables)) out.push(`"${t}"`);
  return out;
}

export function FormulaInput({
  value,
  onChange,
  info,
  placeholder,
  optional,
}: {
  value: string | null | undefined;
  onChange: (v: string) => void;
  info: ScopeInfo | null;
  placeholder?: string;
  optional?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [focus, setFocus] = useState(false);
  const [caret, setCaret] = useState(0);
  const [sel, setSel] = useState(0);
  const text = value ?? '';
  const all = useMemo(() => (info ? suggestions(info) : []), [info]);
  const token = /[\p{L}\p{N}_.[\]"]*$/u.exec(text.slice(0, caret))?.[0] ?? '';
  const list = useMemo(() => {
    if (!token || token.endsWith(']') || token.endsWith('(')) return [];
    const t = token.toLowerCase();
    return all.filter((s) => s.toLowerCase().startsWith(t) && s.toLowerCase() !== t).slice(0, 12);
  }, [all, token]);
  const errors = useMemo(() => {
    if (!info) return [];
    if (!text.trim()) return optional ? [] : ['Thiếu công thức'];
    return analyzeFormula(text, info).errors;
  }, [text, info, optional]);

  const accept = (s: string) => {
    const before = text.slice(0, caret - token.length);
    const after = text.slice(caret);
    const next = before + s + after;
    onChange(next);
    const pos = before.length + s.length;
    requestAnimationFrame(() => {
      ref.current?.setSelectionRange(pos, pos);
      setCaret(pos);
    });
  };

  return (
    <div className="formula">
      <textarea
        ref={ref}
        rows={Math.min(6, Math.max(1, Math.ceil(text.length / 70)))}
        spellCheck={false}
        className={errors.length ? 'invalid' : undefined}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setCaret(e.target.selectionStart);
          setSel(0);
        }}
        onKeyUp={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart)}
        onClick={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart)}
        onFocus={() => setFocus(true)}
        onBlur={() => setTimeout(() => setFocus(false), 150)}
        onKeyDown={(e) => {
          if (!focus || !list.length) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSel((sel + 1) % list.length);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSel((sel - 1 + list.length) % list.length);
          } else if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            accept(list[Math.min(sel, list.length - 1)]);
          } else if (e.key === 'Escape') setFocus(false);
        }}
      />
      {focus && list.length > 0 && (
        <ul className="suggest">
          {list.map((s, i) => (
            <li key={s} className={i === sel ? 'active' : undefined} onMouseDown={(e) => (e.preventDefault(), accept(s))}>
              {s}
            </li>
          ))}
        </ul>
      )}
      {errors.length > 0 && (
        <div className="ferr">
          {errors.map((m, i) => (
            <div key={i}>{m}</div>
          ))}
        </div>
      )}
    </div>
  );
}
