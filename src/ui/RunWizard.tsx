// Run wizard: period & parameters → inputs (+ ledger) → column mapping → compute → checks → preview → download.
// All payroll data stays in this component's memory; nothing is sent to the server.
import { useMemo, useState } from 'react';
import { api, errMsg, type User } from '../api';
import { proposeMapping, readInput, normalizeHeader, type MappingProposal, type ParsedInput, type RawSheet } from '../engine/inputs';
import { emptyLedger, hasRowsFor, laterPeriods, periodOf } from '../engine/ledger';
import { runFlow, type RunResult } from '../engine/run';
import type { FlowConfig, InputDef, MasterTable, Scalar } from '../engine/types';
import { contextFromMasters, validateConfig } from '../engine/validate';
import { readLedger, writeLedger, type LedgerRead } from '../excel/ledgerFile';
import { readSheets } from '../excel/read';
import { ledgerFileName, writeForms } from '../excel/writeForms';
import { Alert, download, useAsync, XLSX_TYPE } from './common';
import { Preview } from './Preview';

interface InputState {
  fileName: string;
  sheets: RawSheet[];
  proposal: MappingProposal;
  /** fields picked by hand in the mapping screen */
  picked: string[];
  parsed: ParsedInput | null;
  error: string;
  showMapping: boolean;
}

export function usesLedger(config: FlowConfig): boolean {
  const f = [config.forms.form02, config.forms.form03];
  return f.some((x) => x.enabled && (x.adjust || (x.ledgerFeed && x.ledgerFeed.sheet !== 'none')));
}

function missingRequired(def: InputDef, proposal: MappingProposal): string[] {
  return def.fields.filter((f) => f.required && proposal.mapping[f.id] === undefined).map((f) => f.id);
}

export function RunWizard({
  config,
  version,
  masters,
  user,
  testMode,
}: {
  config: FlowConfig;
  version: number | null;
  masters: MasterTable[];
  user: User;
  testMode: boolean;
}) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [params, setParams] = useState<Record<string, string>>(() => Object.fromEntries(config.runParams.map((p) => [p.id, p.default ?? ''])));
  const [inputs, setInputs] = useState<Record<string, InputState>>({});
  const [ledgerFile, setLedgerFile] = useState<{ name: string; read: LedgerRead } | null>(null);
  const [ledgerErr, setLedgerErr] = useState('');
  const [confirm, setConfirm] = useState({ stale: false, edited: false, empty: false, replace: false });
  const [result, setResult] = useState<RunResult | null>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const ledgerName = config.ledger || 'shared';
  const needLedger = usesLedger(config);
  const mark = useAsync(() => (needLedger ? api.ledgerMark(ledgerName) : Promise.resolve({ mark: null })), [ledgerName, needLedger]);
  const period = periodOf(year, month);
  const masterMap = useMemo(() => Object.fromEntries(masters.map((t) => [t.name, t])), [masters]);
  const configErrors = useMemo(() => validateConfig(config, contextFromMasters(masters)), [config, masters]);

  const invalidate = () => {
    setResult(null);
    setMsg(null);
  };

  // ---- inputs -------------------------------------------------------------
  const loadInput = async (def: InputDef, file: File | undefined) => {
    invalidate();
    if (!file) {
      setInputs((s) => {
        const n = { ...s };
        delete n[def.id];
        return n;
      });
      return;
    }
    setBusy(`Đang đọc ${file.name}…`);
    try {
      const sheets = await readSheets(file);
      const proposal = proposeMapping(sheets, def);
      if (!proposal) throw new Error('File không có sheet nào');
      const miss = missingRequired(def, proposal);
      const parsed = miss.length ? null : readInput(sheets, def, proposal);
      setInputs((s) => ({ ...s, [def.id]: { fileName: file.name, sheets, proposal, picked: [], parsed, error: '', showMapping: miss.length > 0 } }));
    } catch (e) {
      setInputs((s) => ({
        ...s,
        [def.id]: { fileName: file.name, sheets: [], proposal: { sheet: '', headerRow: 0, headers: [], mapping: {}, missingRequired: [], missingOptional: [] }, picked: [], parsed: null, error: errMsg(e), showMapping: false },
      }));
    } finally {
      setBusy('');
    }
  };

  const remap = (def: InputDef, patch: Partial<MappingProposal>, pickedField?: string) => {
    invalidate();
    setInputs((s) => {
      const st = s[def.id];
      if (!st) return s;
      let proposal = { ...st.proposal, ...patch };
      if (patch.sheet !== undefined || patch.headerRow !== undefined) {
        const sheet = st.sheets.find((x) => x.name === proposal.sheet);
        proposal = { ...proposal, headers: (sheet?.rows[proposal.headerRow] ?? []).map((c) => (c === null || c === undefined ? '' : String(c))) };
      }
      const miss = missingRequired(def, proposal);
      proposal.missingRequired = miss;
      let parsed: ParsedInput | null = null;
      let error = '';
      if (!miss.length)
        try {
          parsed = readInput(st.sheets, def, proposal);
        } catch (e) {
          error = errMsg(e);
        }
      const picked = pickedField ? [...new Set([...st.picked, pickedField])] : st.picked;
      return { ...s, [def.id]: { ...st, proposal, parsed, error, picked } };
    });
  };

  const saveAliases = async () => {
    setMsg(null);
    try {
      const detail = await api.flow(config.id);
      const base: FlowConfig = structuredClone(detail.draft?.config ?? config);
      let added = 0;
      for (const def of base.inputs) {
        const st = inputs[def.id];
        if (!st) continue;
        for (const fid of st.picked) {
          const idx = st.proposal.mapping[fid];
          const header = idx === undefined ? '' : String(st.proposal.headers[idx] ?? '').trim();
          const field = def.fields.find((f) => f.id === fid);
          if (!field || !header) continue;
          if (!field.aliases.some((a) => normalizeHeader(a) === normalizeHeader(header))) {
            field.aliases.push(header.replace(/\s+/g, ' '));
            added++;
          }
        }
      }
      if (!added) return setMsg({ kind: 'ok', text: 'Không có alias mới để lưu.' });
      await api.saveDraft(config.id, base);
      setMsg({ kind: 'ok', text: `Đã lưu ${added} alias vào bản nháp của flow. Cần publish để áp dụng cho mọi người.` });
    } catch (e) {
      setMsg({ kind: 'error', text: errMsg(e) });
    }
  };

  // ---- ledger -------------------------------------------------------------
  const loadLedger = async (file: File | undefined) => {
    invalidate();
    setLedgerErr('');
    setConfirm({ stale: false, edited: false, empty: false, replace: false });
    if (!file) return setLedgerFile(null);
    setBusy(`Đang đọc ledger ${file.name}…`);
    try {
      setLedgerFile({ name: file.name, read: await readLedger(file) });
    } catch (e) {
      setLedgerFile(null);
      setLedgerErr(errMsg(e));
    } finally {
      setBusy('');
    }
  };
  const m = mark.data?.mark ?? null;
  const ledger = ledgerFile?.read.ledger ?? null;
  const gates = {
    stale: !!(ledgerFile && m && m.file_hash !== ledgerFile.read.hash),
    edited: !!ledgerFile?.read.editedOutside,
    empty: needLedger && !ledgerFile && !!m,
    replace: !!(ledger && hasRowsFor(ledger, config.id, period)),
  };
  const later = ledger ? laterPeriods(ledger, period) : [];

  // ---- compute ------------------------------------------------------------
  const paramsMissing = config.runParams.filter((p) => p.required && !String(params[p.id] ?? '').trim());
  const inputsMissing = config.inputs.filter((d) => d.required && !inputs[d.id]?.parsed);
  const gatesOpen = (Object.keys(gates) as (keyof typeof gates)[]).filter((k) => gates[k] && !confirm[k]);
  const canCompute = !configErrors.length && !paramsMissing.length && !inputsMissing.length && !gatesOpen.length && !(needLedger && mark.loading);

  const compute = () => {
    setBusy('Đang tính…');
    setMsg(null);
    setTimeout(() => {
      try {
        const run: Record<string, Scalar> = { month, year };
        for (const p of config.runParams) {
          const v = params[p.id] ?? '';
          run[p.id] = p.type === 'number' ? (v.trim() === '' ? null : Number(v)) : v;
        }
        const parsed: Record<string, ParsedInput> = {};
        for (const d of config.inputs) if (inputs[d.id]?.parsed) parsed[d.id] = inputs[d.id].parsed!;
        setResult(
          runFlow({
            config,
            masters: masterMap,
            inputs: parsed,
            run: run as { month: number; year: number },
            ledger: needLedger ? (ledger ?? emptyLedger()) : null,
          }),
        );
      } catch (e) {
        setMsg({ kind: 'error', text: `Lỗi khi tính: ${errMsg(e)}` });
      } finally {
        setBusy('');
      }
    }, 20);
  };

  const exportAll = async () => {
    if (!result || result.blocked) return;
    setBusy('Đang tạo file…');
    setMsg(null);
    try {
      const forms = await writeForms(config, result, testMode);
      let ledgerOut: { buffer: ArrayBuffer; hash: string; name: string } | null = null;
      if (result.ledgerOut) {
        const l = await writeLedger(result.ledgerOut, config.id, result.period);
        ledgerOut = { ...l, name: ledgerFileName(config.id, result.period, testMode) };
      }
      // one action → both files, so Forms and ledger cannot drift apart
      download(forms.buffer, forms.fileName, XLSX_TYPE);
      if (ledgerOut) setTimeout(() => download(ledgerOut!.buffer, ledgerOut!.name, XLSX_TYPE), 400);
      if (!testMode) {
        const tasks: Promise<unknown>[] = [api.logRun(config.id, version, result.period)];
        if (ledgerOut) tasks.push(api.putLedgerMark(ledgerName, result.period, ledgerOut.hash));
        await Promise.all(tasks);
        mark.reload();
      }
      setMsg({
        kind: 'ok',
        text: `Đã tải ${forms.fileName}${ledgerOut ? ` và ${ledgerOut.name}` : ''}.${ledgerOut ? ' Lưu file ledger mới vào thư mục chung — lần chạy sau phải dùng đúng file này.' : ''}`,
      });
    } catch (e) {
      setMsg({ kind: 'error', text: `Đã tạo file nhưng gặp lỗi: ${errMsg(e)}. Nếu chưa ghi nhận được dấu ledger, lần chạy sau sẽ cảnh báo file cũ.` });
    } finally {
      setBusy('');
    }
  };

  // ---- render -------------------------------------------------------------
  return (
    <section className="wizard">
      <h2>
        {config.name} <span className="muted">({config.id}{version ? ` · v${version}` : ''}{testMode ? ' · CHẠY THỬ' : ''})</span>
      </h2>
      {testMode && <Alert kind="warning">Chạy thử: file xuất có hậu tố _TEST, không ghi nhật ký chạy, không cập nhật dấu ledger.</Alert>}
      {configErrors.length > 0 && (
        <Alert kind="error">
          Cấu hình flow còn lỗi, không chạy được:
          <ul>
            {configErrors.slice(0, 20).map((e, i) => (
              <li key={i}>
                <code>{e.path}</code>: {e.message}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="card">
        <h3>1. Kỳ và tham số</h3>
        <div className="form-grid">
          <label>
            Tháng
            <select
              value={month}
              onChange={(e) => {
                invalidate();
                setConfirm((c) => ({ ...c, replace: false }));
                setMonth(Number(e.target.value));
              }}
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </label>
          <label>
            Năm
            <input
              type="number"
              value={year}
              min={2000}
              max={2100}
              onChange={(e) => {
                invalidate();
                setConfirm((c) => ({ ...c, replace: false }));
                setYear(Number(e.target.value));
              }}
            />
          </label>
          {config.runParams.map((p) => (
            <label key={p.id}>
              {p.label}
              {p.required ? ' *' : ''}
              {p.type === 'master' ? (
                <select
                  value={params[p.id] ?? ''}
                  onChange={(e) => {
                    invalidate();
                    setParams({ ...params, [p.id]: e.target.value });
                  }}
                >
                  <option value="">— chọn —</option>
                  {(masterMap[p.table ?? '']?.rows ?? []).map((r, i) => (
                    <option key={i} value={String(r[0] ?? '')}>
                      {String(r[0] ?? '')}
                      {r[1] !== undefined && r[1] !== null ? ` — ${String(r[1])}` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={p.type === 'number' ? 'number' : p.type === 'date' ? 'date' : 'text'}
                  value={params[p.id] ?? ''}
                  onChange={(e) => {
                    invalidate();
                    setParams({ ...params, [p.id]: e.target.value });
                  }}
                />
              )}
            </label>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>2. File dữ liệu</h3>
        {config.inputs.map((def) => {
          const st = inputs[def.id];
          return (
            <div key={def.id} className="input-block">
              <div className="row gap wrap">
                <strong>
                  {def.label || def.id}
                  {def.required ? ' *' : ''}
                </strong>
                <input type="file" accept=".xlsx,.xlsm" onChange={(e) => loadInput(def, e.target.files?.[0])} />
                {st?.parsed && (
                  <span className="ok-text">
                    ✓ {st.parsed.rows.length} dòng · sheet "{st.parsed.sheet}" · tiêu đề ở dòng {st.parsed.headerRow + 1}
                  </span>
                )}
                {st && !st.error && (
                  <button type="button" className="link" onClick={() => setInputs({ ...inputs, [def.id]: { ...st, showMapping: !st.showMapping } })}>
                    {st.showMapping ? 'Ẩn mapping cột' : 'Xem / sửa mapping cột'}
                  </button>
                )}
              </div>
              {st?.error && <Alert kind="error">{st.error}</Alert>}
              {st && !st.error && st.proposal.missingRequired.length > 0 && (
                <Alert kind="warning">Chưa tìm thấy cột bắt buộc: {st.proposal.missingRequired.join(', ')}. Chọn cột tương ứng bên dưới.</Alert>
              )}
              {st && st.showMapping && !st.error && <MappingEditor def={def} st={st} onChange={(patch, f) => remap(def, patch, f)} />}
            </div>
          );
        })}
        {user.role === 'admin' && !testMode && Object.values(inputs).some((s) => s.picked.length) && (
          <button type="button" onClick={saveAliases}>
            Lưu các cột đã chọn tay làm alias (vào bản nháp flow)
          </button>
        )}

        {needLedger && (
          <div className="input-block">
            <div className="row gap wrap">
              <strong>Sổ ledger (file mới nhất)</strong>
              <input type="file" accept=".xlsx" onChange={(e) => loadLedger(e.target.files?.[0])} />
              {ledgerFile && (
                <span className="ok-text">
                  ✓ {ledgerFile.read.ledger.accrual.length} dòng trích · {ledgerFile.read.ledger.actual.length} dòng chi
                  {ledgerFile.read.ledger.meta ? ` · kỳ cuối ${ledgerFile.read.ledger.meta.lastPeriod} (${ledgerFile.read.ledger.meta.flow})` : ''}
                </span>
              )}
            </div>
            {ledgerErr && <Alert kind="error">{ledgerErr}</Alert>}
            {mark.error && <Alert kind="error">Không lấy được dấu ledger: {mark.error}</Alert>}
            {!ledgerFile && !m && !mark.loading && <p className="muted small">Chưa có ledger nào được ghi nhận — lần chạy đầu tiên bắt đầu từ ledger rỗng (số dư đầu kỳ = 0).</p>}
            {gates.stale && (
              <Gate checked={confirm.stale} onChange={(v) => setConfirm({ ...confirm, stale: v })} kind="error">
                File ledger này <b>không phải bản mới nhất</b>. Bản mới nhất do <b>{m!.updated_by}</b> tạo lúc {new Date(m!.updated_at).toLocaleString('vi-VN')} (kỳ {m!.last_period}).
                Hãy lấy file mới nhất từ thư mục chung. Chỉ tiếp tục nếu chắc chắn.
              </Gate>
            )}
            {gates.edited && (
              <Gate checked={confirm.edited} onChange={(v) => setConfirm({ ...confirm, edited: v })} kind="warning">
                Dữ liệu trong file ledger đã bị sửa ngoài ứng dụng (hash không khớp với sheet _meta).
              </Gate>
            )}
            {gates.empty && (
              <Gate checked={confirm.empty} onChange={(v) => setConfirm({ ...confirm, empty: v })} kind="error">
                Đã có ledger (kỳ {m!.last_period}, {m!.updated_by}, {new Date(m!.updated_at).toLocaleString('vi-VN')}) nhưng bạn chưa chọn file. Bắt đầu với ledger rỗng sẽ{' '}
                <b>mất toàn bộ lịch sử điều chỉnh</b>.
              </Gate>
            )}
            {gates.replace && (
              <Gate checked={confirm.replace} onChange={(v) => setConfirm({ ...confirm, replace: v })} kind="warning" label="Thay thế dữ liệu cũ của kỳ này">
                Ledger đã có dữ liệu của flow {config.id} cho kỳ {period}. Chọn "Thay thế" để ghi đè (không nhân đôi), hoặc đổi kỳ / huỷ.
              </Gate>
            )}
            {later.length > 0 && <Alert kind="warning">Ledger đã có các kỳ sau kỳ đang chạy ({later.join(', ')}). Số điều chỉnh của các kỳ đó sẽ không tự cập nhật.</Alert>}
          </div>
        )}
      </div>

      <div className="card">
        <h3>3. Tính và kiểm tra</h3>
        {paramsMissing.length > 0 && <p className="muted">Thiếu tham số: {paramsMissing.map((p) => p.label).join(', ')}</p>}
        {inputsMissing.length > 0 && <p className="muted">Thiếu file: {inputsMissing.map((d) => d.label || d.id).join(', ')}</p>}
        {gatesOpen.length > 0 && <p className="muted">Cần xác nhận các cảnh báo ledger ở trên.</p>}
        <div className="row gap">
          <button type="button" className="primary" disabled={!canCompute || !!busy} onClick={compute}>
            Tính
          </button>
          {result && (
            <button type="button" className="primary" disabled={result.blocked || !!busy} onClick={exportAll}>
              Tải Form{result.ledgerOut ? ' + Ledger' : ''}
            </button>
          )}
          {busy && <span className="muted">{busy}</span>}
        </div>
        {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
        {result?.blocked && <Alert kind="error">Có lỗi mức "error" — không thể xuất file. Sửa dữ liệu nguồn (hoặc cấu hình) rồi chạy lại.</Alert>}
      </div>

      {result && <Preview config={config} result={result} />}
    </section>
  );
}

function Gate({ children, checked, onChange, kind, label }: { children: React.ReactNode; checked: boolean; onChange: (v: boolean) => void; kind: 'error' | 'warning'; label?: string }) {
  return (
    <Alert kind={kind}>
      <div>{children}</div>
      <label className="check">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {label ?? 'Tôi đã hiểu và vẫn tiếp tục'}
      </label>
    </Alert>
  );
}

function MappingEditor({ def, st, onChange }: { def: InputDef; st: InputState; onChange: (patch: Partial<MappingProposal>, field?: string) => void }) {
  const sheet = st.sheets.find((s) => s.name === st.proposal.sheet);
  return (
    <div className="mapping">
      <div className="row gap wrap">
        <label>
          Sheet
          <select value={st.proposal.sheet} onChange={(e) => onChange({ sheet: e.target.value, headerRow: 0, mapping: {} })}>
            {st.sheets.map((s) => (
              <option key={s.name}>{s.name}</option>
            ))}
          </select>
        </label>
        <label>
          Dòng tiêu đề
          <select value={st.proposal.headerRow} onChange={(e) => onChange({ headerRow: Number(e.target.value), mapping: {} })}>
            {Array.from({ length: Math.min(20, sheet?.rows.length ?? 1) }, (_, i) => (
              <option key={i} value={i}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
      </div>
      <table className="grid compact">
        <thead>
          <tr>
            <th>Field</th>
            <th>Cột trong file</th>
            <th>Alias đã khai báo</th>
          </tr>
        </thead>
        <tbody>
          {def.fields.map((f) => {
            const idx = st.proposal.mapping[f.id];
            return (
              <tr key={f.id} className={f.required && idx === undefined ? 'row-error' : undefined}>
                <td>
                  {f.label || f.id}
                  {f.required ? ' *' : ''} <span className="muted small">({f.id})</span>
                </td>
                <td>
                  <select
                    value={idx === undefined ? '' : String(idx)}
                    onChange={(e) => {
                      const mapping = { ...st.proposal.mapping };
                      if (e.target.value === '') delete mapping[f.id];
                      else mapping[f.id] = Number(e.target.value);
                      onChange({ mapping }, f.id);
                    }}
                  >
                    <option value="">(không có)</option>
                    {st.proposal.headers.map((h, i) => (
                      <option key={i} value={i}>
                        {colLetter(i)}: {String(h ?? '').replace(/\s+/g, ' ').trim() || '(trống)'}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="muted small">{f.aliases.join(' | ')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function colLetter(i: number): string {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
