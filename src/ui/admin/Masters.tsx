// Master tables: grid edit, add/delete rows and columns, xlsx import (replace or merge by key) and export.
// Effective-dated: the page shows the version in force for a chosen period; saving adds a version from
// a payroll period; the history lists every version (load one into the editor, cancel / restore).
import { useEffect, useMemo, useState } from 'react';
import { api, errMsg, type MasterVersionData, type VersionInfo } from '../../api';
import { BEGINNING, currentPeriod, periodLabel } from '../../engine/effective';
import type { MasterTable, Scalar } from '../../engine/types';
import { tableToXlsx, xlsxToTable } from '../../excel/masterFile';
import { Alert, download, useAsync, XLSX_TYPE } from '../common';
import { Icon, PageHeader, toast } from '../layout';
import { EffectiveDialog, range, StatePill, VersionTable } from './Effective';
import { Guide, T } from '../texts';

const PAGE = 100;

export function MastersPage() {
  const [viewPeriod, setViewPeriod] = useState(currentPeriod());
  const list = useAsync(() => api.masters(viewPeriod), [viewPeriod]);
  const [sel, setSel] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  /** a version loaded into the editor as the starting point of a new version */
  const [loaded, setLoaded] = useState<MasterVersionData | null>(null);
  const catalog = list.data?.catalog ?? [];
  const name = sel && catalog.some((c) => c.name === sel) ? sel : (catalog[0]?.name ?? null);
  const atPeriod = list.data?.tables.find((t) => t.name === name) ?? null;
  const versions = catalog.find((c) => c.name === name)?.versions ?? [];
  const base = loaded && loaded.name === name ? loaded : atPeriod;
  const reload = () => {
    setLoaded(null);
    list.reload();
  };
  return (
    <>
      <PageHeader
        icon="table"
        crumb={<T k="nav.group.admin">Quản trị</T>}
        title={<T k="masters.title">Master data</T>}
        subtitle={
          <T k="masters.subtitle">
            Bảng tra cứu dùng chung cho mọi flow. Cột đầu tiên là khoá. Tham số dạng số đặt trong bảng Params (key, value). Mỗi lần lưu tạo phiên bản mới có hiệu lực từ một kỳ.
          </T>
        }
        actions={<PeriodPicker value={viewPeriod} onChange={(p) => (setLoaded(null), setViewPeriod(p))} />}
      />
      <Guide k="masters.guide" />
      <section className="split">
        <aside className="card side">
          <div className="card-head">
            <div className="card-title">Bảng master</div>
          </div>
          <div className="card-body">
            {list.error && <Alert kind="error">{list.error}</Alert>}
            <ul className="side-list">
              {catalog.map((c) => {
                const t = list.data?.tables.find((x) => x.name === c.name);
                return (
                  <li key={c.name}>
                    <button type="button" className={c.name === name ? 'side-item active' : 'side-item'} onClick={() => (setLoaded(null), setSel(c.name))}>
                      <Icon name="table" size={16} />
                      <span className="side-name">{c.name}</span>
                      <span className="side-count" title={t ? `v${t.version}, ${t.rows.length} dòng` : 'Không có phiên bản hiệu lực cho kỳ đang xem'}>
                        {t ? `v${t.version} · ${t.rows.length}` : '—'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="row gap">
              <input placeholder="Tên bảng mới" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <button
                type="button"
                disabled={!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(newName) || catalog.some((t) => t.name === newName)}
                onClick={async () => {
                  try {
                    await api.putMaster({ name: newName, columns: newName === 'Params' ? ['key', 'value'] : ['Key'], rows: [] }, BEGINNING, 'Tạo bảng');
                    setSel(newName);
                    setNewName('');
                    reload();
                  } catch (e) {
                    toast('error', errMsg(e));
                  }
                }}
              >
                Tạo
              </button>
            </div>
          </div>
        </aside>
        <div className="grow">
          {name ? (
            <>
              <MasterEditor
                key={`${name}|${base ? `${'cancelled' in base ? 'loaded' : 'at'}-${base.version}` : 'none'}|${viewPeriod}`}
                name={name}
                base={base}
                loadedFrom={loaded && loaded.name === name ? loaded.version : null}
                viewPeriod={viewPeriod}
                versions={versions}
                onSaved={reload}
                onDeleted={() => (setSel(null), reload())}
                onDiscardLoaded={() => setLoaded(null)}
              />
              <div className="card">
                <div className="card-head">
                  <div className="card-title">Lịch sử phiên bản — {name}</div>
                </div>
                <div className="card-body">
                  <VersionTable
                    versions={versions}
                    selected={base?.version}
                    actions={(v) => (
                      <>
                        <button
                          type="button"
                          className="sm"
                          title="Nạp dữ liệu của phiên bản này vào trình sửa để tạo phiên bản mới"
                          onClick={async () => {
                            try {
                              setLoaded(await api.masterVersion(name, v.version));
                            } catch (e) {
                              toast('error', errMsg(e));
                            }
                          }}
                        >
                          Nạp vào trình sửa
                        </button>
                        {v.state === 'cancelled' ? (
                          <button type="button" className="sm" onClick={() => versionAction(name, v, 'restore', reload)}>
                            Khôi phục
                          </button>
                        ) : (
                          <button type="button" className="sm danger" onClick={() => versionAction(name, v, 'cancel', reload)}>
                            Huỷ hiệu lực
                          </button>
                        )}
                      </>
                    )}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="empty">Chưa có bảng master nào. Tạo bảng mới ở khung bên trái.</div>
          )}
        </div>
      </section>
    </>
  );
}

async function versionAction(name: string, v: VersionInfo, a: 'cancel' | 'restore', done: () => void) {
  const text =
    a === 'cancel'
      ? `Huỷ hiệu lực ${name} v${v.version}? Phiên bản vẫn được lưu trong lịch sử; các kỳ ${range(v)} sẽ dùng phiên bản liền trước.`
      : `Khôi phục hiệu lực ${name} v${v.version} (từ kỳ ${periodLabel(v.effective_from)})?`;
  if (!confirm(text)) return;
  try {
    await api.masterVersionAction(name, v.version, a);
    toast('ok', a === 'cancel' ? `Đã huỷ hiệu lực v${v.version}.` : `Đã khôi phục hiệu lực v${v.version}.`);
    done();
  } catch (e) {
    toast('error', errMsg(e));
  }
}

/** Month / year picker for "xem theo kỳ" (compact, for a page bar). */
export function PeriodPicker({ value, onChange }: { value: string; onChange: (p: string) => void }) {
  const [y, m] = value.split('-').map(Number);
  const set = (yy: number, mm: number) => onChange(`${yy}-${String(mm).padStart(2, '0')}`);
  return (
    <span className="period-picker" title="Xem dữ liệu có hiệu lực ở kỳ này">
      <span className="muted">Kỳ</span>
      <select value={m} onChange={(e) => set(y, Number(e.target.value))} aria-label="Xem theo tháng">
        {Array.from({ length: 12 }, (_, i) => (
          <option key={i + 1} value={i + 1}>
            {String(i + 1).padStart(2, '0')}
          </option>
        ))}
      </select>
      <select value={y} onChange={(e) => set(Number(e.target.value), m)} aria-label="Xem theo năm">
        {Array.from({ length: 11 }, (_, i) => new Date().getFullYear() - 6 + i).map((yy) => (
          <option key={yy} value={yy}>
            {yy}
          </option>
        ))}
      </select>
    </span>
  );
}

function MasterEditor({
  name,
  base,
  loadedFrom,
  viewPeriod,
  versions,
  onSaved,
  onDeleted,
  onDiscardLoaded,
}: {
  name: string;
  /** the version applying to the period being viewed, or a version loaded from the history */
  base: (MasterTable & { version: number; effective_from: string; note: string | null; by: string | null; at: string }) | null;
  loadedFrom: number | null;
  viewPeriod: string;
  versions: VersionInfo[];
  onSaved: () => void;
  onDeleted: () => void;
  onDiscardLoaded: () => void;
}) {
  const table = { name };
  const [cols, setCols] = useState<string[]>(base?.columns ?? ['Key']);
  const [rows, setRows] = useState<Scalar[][]>(base?.rows ?? []);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [mode, setMode] = useState<'replace' | 'merge'>('merge');

  useEffect(() => setPage(0), [q]);
  const indexed = useMemo(() => rows.map((r, i) => ({ r, i })), [rows]);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? indexed.filter(({ r }) => r.some((v) => String(v ?? '').toLowerCase().includes(s))) : indexed;
  }, [indexed, q]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const slice = filtered.slice(page * PAGE, (page + 1) * PAGE);

  const change = (fn: () => void) => {
    fn();
    setDirty(true);
    setMsg(null);
  };
  const setCell = (ri: number, ci: number, raw: string) =>
    change(() =>
      setRows((rs) => {
        const n = rs.slice();
        const row = n[ri].slice();
        row[ci] = parseCell(raw, rs, ci);
        n[ri] = row;
        return n;
      }),
    );

  const save = () => {
    const keys = rows.map((r) => String(r[0] ?? '').trim().toUpperCase()).filter(Boolean);
    const dup = keys.find((k, i) => keys.indexOf(k) !== i);
    if (dup) return setMsg({ kind: 'error', text: `Khoá "${dup}" ở cột đầu bị trùng` });
    setSaving(true);
  };
  const doSave = async (effectiveFrom: string, note: string) => {
    try {
      const r = await api.putMaster({ name: table.name, columns: cols, rows }, effectiveFrom, note);
      setSaving(false);
      setDirty(false);
      toast('ok', `Đã lưu ${table.name} v${r.version}, hiệu lực từ ${periodLabel(effectiveFrom)}.`);
      onSaved();
    } catch (e) {
      setSaving(false);
      setMsg({ kind: 'error', text: errMsg(e) });
    }
  };
  const cur = base ? versions.find((v) => v.version === base.version) : undefined;

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const t = await xlsxToTable(file, table.name);
      if (mode === 'replace') {
        setCols(t.columns);
        setRows(t.rows);
      } else {
        // merge by key: columns are unioned, rows with the same key are updated, new keys appended
        const allCols = [...cols];
        for (const c of t.columns) if (!allCols.some((x) => x.toLowerCase() === c.toLowerCase())) allCols.push(c);
        const pos = (c: string) => allCols.findIndex((x) => x.toLowerCase() === c.toLowerCase());
        const keyOf = (v: Scalar) => String(v ?? '').trim().toUpperCase();
        const out = rows.map((r) => allCols.map((_, i) => (i < r.length ? r[i] : null)));
        const at = new Map(out.map((r, i) => [keyOf(r[0]), i]));
        if (pos(t.columns[0]) !== 0) throw new Error(`Cột khoá của file ("${t.columns[0]}") phải trùng cột đầu của bảng ("${cols[0]}")`);
        for (const r of t.rows) {
          const k = keyOf(r[0]);
          if (!k) continue;
          let idx = at.get(k);
          if (idx === undefined) {
            out.push(allCols.map(() => null));
            idx = out.length - 1;
            at.set(k, idx);
          }
          t.columns.forEach((c, i) => (out[idx!][pos(c)] = r[i]));
        }
        setCols(allCols);
        setRows(out);
      }
      setDirty(true);
      setMsg({ kind: 'ok', text: `Đã nạp ${t.rows.length} dòng từ file (${mode === 'replace' ? 'thay thế' : 'gộp theo khoá'}). Bấm Lưu để ghi.` });
    } catch (e) {
      setMsg({ kind: 'error', text: errMsg(e) });
    }
  };

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">
          {table.name}
          {base && <span className="pill">v{base.version}</span>}
          {cur && <StatePill state={cur.state} />}
          <span className="muted small">
            {rows.length} dòng · {cols.length} cột
            {cur && cur.state !== 'superseded' && cur.state !== 'cancelled' ? ` · hiệu lực ${range(cur)}` : ''}
            {base ? ` · ${base.by ?? ''}, ${new Date(base.at).toLocaleString('vi-VN')}` : ''}
          </span>
        </div>
      </div>
      <div className="card-body">
      {loadedFrom !== null && (
        <Alert kind="info">
          Đang sửa từ dữ liệu của v{loadedFrom}. Lưu sẽ tạo phiên bản mới; v{loadedFrom} giữ nguyên.{' '}
          <button type="button" className="link" onClick={onDiscardLoaded}>
            Quay về bản của kỳ đang xem
          </button>
        </Alert>
      )}
      {!base && <Alert kind="warning">Kỳ {periodLabel(viewPeriod)} không có phiên bản nào của bảng này có hiệu lực. Lưu sẽ tạo phiên bản mới.</Alert>}
      {saving && (
        <EffectiveDialog
          title={`Lưu ${table.name} thành phiên bản mới`}
          what={`bảng ${table.name}`}
          versions={versions}
          onClose={() => setSaving(false)}
          onSave={doSave}
        />
      )}
      <div className="toolbar">
        <button type="button" className="primary" disabled={!dirty} onClick={save}>
          Lưu phiên bản mới
        </button>
        <button type="button" onClick={async () => download(await tableToXlsx({ name: table.name, columns: cols, rows }), `${table.name}.xlsx`, XLSX_TYPE)}>
          Xuất xlsx
        </button>
        <label className="button">
          Nhập xlsx
          <input type="file" accept=".xlsx" hidden onChange={(e) => (importFile(e.target.files?.[0]), (e.target.value = ''))} />
        </label>
        <select value={mode} onChange={(e) => setMode(e.target.value as 'replace' | 'merge')}>
          <option value="merge">gộp theo khoá</option>
          <option value="replace">thay thế toàn bộ</option>
        </select>
        <button
          type="button"
          className="danger"
          onClick={async () => {
            if (!confirm(`Xoá bảng ${table.name} cùng TOÀN BỘ ${versions.length} phiên bản? Không khôi phục được. Flow nào dùng bảng này sẽ không chạy được.`)) return;
            if (prompt(`Gõ tên bảng (${table.name}) để xác nhận xoá`) !== table.name) return;
            await api.deleteMaster(table.name);
            onDeleted();
          }}
        >
          Xoá bảng
        </button>
      </div>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <div className="toolbar">
        <input className="search" placeholder="Tìm…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" onClick={() => change(() => setRows((rs) => [...rs, cols.map(() => null)]))}>
          + Dòng
        </button>
        <button
          type="button"
          onClick={() => {
            const name = prompt('Tên cột mới');
            if (!name || cols.some((c) => c.toLowerCase() === name.trim().toLowerCase())) return;
            change(() => {
              setCols((c) => [...c, name.trim()]);
              setRows((rs) => rs.map((r) => [...r, null]));
            });
          }}
        >
          + Cột
        </button>
        {pages > 1 && (
          <span className="row gap">
            <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>
              ‹
            </button>
            {page + 1}/{pages}
            <button type="button" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
              ›
            </button>
          </span>
        )}
      </div>
      <div className="table-wrap">
        <table className="grid edit">
          <thead>
            <tr>
              <th></th>
              {cols.map((c, ci) => (
                <th key={ci}>
                  <div className="th-edit">
                  <input
                    className="cell head"
                    value={c}
                    onChange={(e) => {
                      const v = e.target.value;
                      change(() => setCols((cs) => cs.map((x, i) => (i === ci ? v : x))));
                    }}
                  />
                  {ci > 0 && (
                    <button
                      type="button"
                      className="link small"
                      title="Xoá cột"
                      onClick={() => {
                        if (!confirm(`Xoá cột "${c}"?`)) return;
                        change(() => {
                          setCols((cs) => cs.filter((_, i) => i !== ci));
                          setRows((rs) => rs.map((r) => r.filter((_, i) => i !== ci)));
                        });
                      }}
                    >
                      ✕
                    </button>
                  )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map(({ r, i }) => (
              <tr key={i}>
                <td>
                  <button type="button" className="link small" title="Xoá dòng" onClick={() => change(() => setRows((rs) => rs.filter((_, j) => j !== i)))}>
                    ✕
                  </button>
                </td>
                {cols.map((_, ci) => (
                  <td key={ci}>
                    <input className={typeof r[ci] === 'number' ? 'cell num' : 'cell'} value={r[ci] === null || r[ci] === undefined ? '' : String(r[ci])} onChange={(e) => setCell(i, ci, e.target.value)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  );
}

/** Keep codes as text: a value becomes a number only if the column already holds numbers and it has no leading zero. */
function parseCell(raw: string, rows: Scalar[][], ci: number): Scalar {
  if (raw === '') return null;
  const numericCol = rows.some((r) => typeof r[ci] === 'number') && !rows.some((r) => typeof r[ci] === 'string' && r[ci] !== '');
  if (numericCol && /^-?(0|[1-9]\d*)(\.\d+)?$/.test(raw.trim())) return Number(raw.trim());
  if (raw === 'TRUE') return true;
  if (raw === 'FALSE') return false;
  return raw;
}
