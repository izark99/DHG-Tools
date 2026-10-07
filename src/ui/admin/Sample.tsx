// Sample data inside the flow editor: the admin loads a payroll file once, the draft configuration is
// run on it in the browser after every change, and each table of the editor shows the value its row
// produces (for one chosen employee and in total). Nothing is uploaded or saved.
import { useEffect, useMemo, useState } from 'react';
import { errMsg } from '../../api';
import { proposeMapping, readInput, type ParsedInput, type RawSheet } from '../../engine/inputs';
import { emptyLedger } from '../../engine/ledger';
import { ledgerPlan, runFlow, type EmpRow, type RunResult } from '../../engine/run';
import type { FlowConfig, InputDef, MasterTable, Scalar } from '../../engine/types';
import { readSheets } from '../../excel/read';
import { FilePick, fmt } from '../common';
import { Icon } from '../layout';

interface SampleFile {
  fileName: string;
  sheets: RawSheet[];
}

export interface Sample {
  /** at least one file loaded */
  on: boolean;
  result: RunResult | null;
  /** parsed inputs (re-read after every change of the input definitions) */
  parsed: Record<string, { data: ParsedInput | null; error: string }>;
  /** the employee whose values are shown */
  emp: EmpRow | null;
  error: string;
}

function parse(def: InputDef, f: SampleFile): { data: ParsedInput | null; error: string } {
  try {
    const p = proposeMapping(f.sheets, def);
    if (!p) return { data: null, error: 'File không có sheet nào' };
    const miss = def.fields.filter((x) => x.required && p.mapping[x.id] === undefined).map((x) => x.label || x.id);
    if (miss.length) return { data: null, error: `Không tìm thấy cột: ${miss.join(', ')} — thêm tên cột của file vào "Tên cột trong file"` };
    return { data: readInput(f.sheets, def, p), error: '' };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export function useSample(cfg: FlowConfig, masters: MasterTable[]) {
  const [files, setFiles] = useState<Record<string, SampleFile>>({});
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [params, setParams] = useState<Record<string, string>>({});
  const [empKey, setEmpKey] = useState('');
  const [busy, setBusy] = useState('');
  const [loadErr, setLoadErr] = useState('');
  // run on a short delay so typing in a formula stays smooth
  const [debounced, setDebounced] = useState(cfg);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(cfg), 350);
    return () => clearTimeout(t);
  }, [cfg]);

  const masterMap = useMemo(() => Object.fromEntries(masters.map((t) => [t.name, t])), [masters]);
  const on = Object.keys(files).length > 0;

  const parsed = useMemo(() => {
    const out: Sample['parsed'] = {};
    for (const def of debounced.inputs) if (files[def.id]) out[def.id] = parse(def, files[def.id]);
    return out;
  }, [debounced.inputs, files]);

  const { result, error } = useMemo(() => {
    if (!on) return { result: null, error: '' };
    try {
      const run: Record<string, Scalar> = { month, year };
      for (const p of debounced.runParams) {
        const v = params[p.id] ?? p.default ?? '';
        run[p.id] = p.type === 'number' ? (v.trim() === '' ? null : Number(v)) : v;
      }
      const inputs: Record<string, ParsedInput> = {};
      for (const [id, p] of Object.entries(parsed)) if (p.data) inputs[id] = p.data;
      const r = runFlow({
        config: debounced,
        masters: masterMap,
        inputs,
        run: run as { month: number; year: number },
        ledger: ledgerPlan(debounced).uses ? emptyLedger() : null,
        mode: 'both',
      });
      return { result: r, error: '' };
    } catch (e) {
      return { result: null, error: `Không tính được: ${errMsg(e)}` };
    }
  }, [on, debounced, masterMap, parsed, month, year, params]);

  const emp = result ? (result.employees.find((e) => e.key === empKey) ?? result.employees[0] ?? null) : null;

  const load = async (def: InputDef, file: File | undefined) => {
    setLoadErr('');
    if (!file)
      return setFiles((s) => {
        const n = { ...s };
        delete n[def.id];
        return n;
      });
    setBusy(`Đang đọc ${file.name}…`);
    try {
      const sheets = await readSheets(file);
      setFiles((s) => ({ ...s, [def.id]: { fileName: file.name, sheets } }));
    } catch (e) {
      setLoadErr(errMsg(e));
    } finally {
      setBusy('');
    }
  };

  const sample: Sample = { on, result, parsed, emp, error: error || loadErr };
  const bar = { files, load, month, setMonth, year, setYear, params, setParams, empKey: emp?.key ?? '', setEmpKey, busy, clear: () => (setFiles({}), setEmpKey('')) };
  return { sample, bar };
}

export type SampleBarProps = ReturnType<typeof useSample>['bar'] & { cfg: FlowConfig; sample: Sample; open: boolean; setOpen: (v: boolean) => void };

/** Slim bar on top of every setup step: load the sample file, pick the employee to follow. */
export function SampleBar({ cfg, sample, open, setOpen, files, load, month, setMonth, year, setYear, params, setParams, empKey, setEmpKey, busy, clear }: SampleBarProps) {
  const r = sample.result;
  const errs = r ? r.issues.filter((i) => i.level === 'error').length : 0;
  const warns = r ? r.issues.filter((i) => i.level === 'warning').length : 0;
  const empLabel = (e: EmpRow) => {
    const name = Object.entries(e.values).find(([k, v]) => /name|ten|ho_?ten/i.test(k) && typeof v === 'string' && v)?.[1];
    return name ? `${e.key} — ${name}` : e.key;
  };
  return (
    <div className={sample.on ? 'sample-bar on' : 'sample-bar'}>
      <div className="sample-head">
        <Icon name="flask" />
        <strong>Dữ liệu mẫu</strong>
        {sample.on ? (
          <>
            <span className="muted small sample-summary">
              {r ? `${r.employees.length} nhân viên · ${r.aggRows.length} dòng tổng hợp` : '—'}
              {errs > 0 && <span className="pill pill-bad">{errs} lỗi</span>}
              {warns > 0 && <span className="pill pill-warn">{warns} cảnh báo</span>}
            </span>
            {r && r.employees.length > 0 && (
              <label className="sample-emp">
                <span>Xem nhân viên</span>
                <select value={empKey} onChange={(e) => setEmpKey(e.target.value)} aria-label="Nhân viên mẫu">
                  {r.employees.slice(0, 2000).map((e) => (
                    <option key={e.key} value={e.key}>
                      {empLabel(e)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        ) : (
          <span className="muted small sample-summary">Nạp một file lương thật để thấy ngay kết quả của từng công thức. File chỉ đọc trên máy này, không gửi lên server.</span>
        )}
        <span className="spacer" />
        {busy && <span className="muted small">{busy}</span>}
        <button type="button" className={open ? 'on' : undefined} onClick={() => setOpen(!open)}>
          {sample.on ? (open ? 'Thu gọn' : 'Đổi dữ liệu') : 'Nạp dữ liệu mẫu'}
        </button>
      </div>
      {open && (
        <div className="sample-body">
          <div className="sample-files">
            {cfg.inputs.map((def) => {
              const p = sample.parsed[def.id];
              return (
                <FilePick
                  key={def.id}
                  label={def.label || def.id}
                  required={def.required}
                  accept=".xlsx,.xlsm"
                  fileName={files[def.id]?.fileName}
                  status={p?.data ? `${files[def.id].fileName} · ${p.data.rows.length} dòng · sheet ${p.data.sheet}` : undefined}
                  bad={!!p?.error}
                  emptyText={p?.error || 'Chưa chọn file (.xlsx)'}
                  onFile={(f) => load(def, f)}
                />
              );
            })}
            {!cfg.inputs.length && <p className="muted small">Chưa khai báo file đầu vào (bước 2).</p>}
          </div>
          {cfg.inputs.map((def) => sample.parsed[def.id]?.error && <div key={def.id} className="ferr">{`${def.label || def.id}: ${sample.parsed[def.id].error}`}</div>)}
          <div className="sample-params">
            <label>
              <span>Tháng</span>
              <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {String(i + 1).padStart(2, '0')}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Năm</span>
              <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || year)} />
            </label>
            {cfg.runParams.map((p) => (
              <label key={p.id}>
                <span>{p.label || p.id}</span>
                <input value={params[p.id] ?? p.default ?? ''} onChange={(e) => setParams({ ...params, [p.id]: e.target.value })} />
              </label>
            ))}
            <span className="spacer" />
            {sample.on && (
              <button type="button" className="danger" onClick={clear}>
                Bỏ dữ liệu mẫu
              </button>
            )}
          </div>
          {sample.error && <div className="ferr">{sample.error}</div>}
          {r && r.issues.length > 0 && (
            <details className="sample-issues">
              <summary>
                Kết quả kiểm tra trên dữ liệu mẫu ({errs} lỗi, {warns} cảnh báo)
              </summary>
              <ul className="small">
                {r.issues.slice(0, 50).map((i, k) => (
                  <li key={k} className={i.level === 'error' ? 'danger-text' : undefined}>
                    {i.message}
                    {i.count > 1 ? ` (${i.count} lần)` : ''}
                    {i.keys.length ? ` — ${i.keys.slice(0, 5).join(', ')}${i.keys.length > 5 ? '…' : ''}` : ''}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

/** "value of the chosen employee · Σ total" for an employee-table column. */
export function SampleValue({ value, total, missing }: { value?: Scalar; total?: number | null; missing?: string }) {
  if (missing) return <span className="sv sv-none">{missing}</span>;
  const v = value === null || value === undefined || value === '' ? '—' : fmt(value);
  return (
    <span className="sv">
      <span className={typeof value === 'number' ? 'sv-main num' : 'sv-main'} title={String(v)}>
        {v}
      </span>
      {total !== undefined && total !== null && (
        <span className="sv-total" title="Tổng">
          Σ {fmt(total)}
        </span>
      )}
    </span>
  );
}

export function sumBy<T>(xs: T[], f: (x: T) => Scalar | undefined): number | null {
  let s = 0;
  let any = false;
  for (const x of xs) {
    const v = f(x);
    if (typeof v === 'number' && Number.isFinite(v)) {
      s += v;
      any = true;
    }
  }
  return any ? Math.round(s * 100) / 100 : null;
}
