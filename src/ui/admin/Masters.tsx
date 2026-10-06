// Master tables: grid edit, add/delete rows and columns, xlsx import (replace or merge by key) and export.
import { useEffect, useMemo, useState } from 'react';
import { api, errMsg } from '../../api';
import type { MasterTable, Scalar } from '../../engine/types';
import { tableToXlsx, xlsxToTable } from '../../excel/masterFile';
import { Alert, download, useAsync, XLSX_TYPE } from '../common';
import { Icon, PageHeader } from '../layout';

const PAGE = 100;

export function MastersPage() {
  const list = useAsync(() => api.masters(), []);
  const [sel, setSel] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const tables = list.data?.tables ?? [];
  const current = tables.find((t) => t.name === sel) ?? tables[0] ?? null;
  return (
    <>
    <PageHeader crumb="Quản trị" title="Master data" subtitle="Bảng tra cứu dùng chung cho mọi flow. Cột đầu tiên là khoá. Tham số dạng số đặt trong bảng Params (key, value)." />
    <section className="split">
      <aside className="card side">
        <div className="card-head"><div className="card-title">Bảng master</div></div>
        <div className="card-body">
        {list.error && <Alert kind="error">{list.error}</Alert>}
        <ul className="side-list">
          {tables.map((t) => (
            <li key={t.name}>
              <button type="button" className={t.name === current?.name ? 'side-item active' : 'side-item'} onClick={() => setSel(t.name)}>
                <Icon name="table" size={16} />
                <span className="side-name">{t.name}</span>
                <span className="side-count">{t.rows.length}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="row gap">
          <input placeholder="Tên bảng mới" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button
            type="button"
            disabled={!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(newName) || tables.some((t) => t.name === newName)}
            onClick={async () => {
              await api.putMaster({ name: newName, columns: newName === 'Params' ? ['key', 'value'] : ['Key'], rows: [] });
              setSel(newName);
              setNewName('');
              list.reload();
            }}
          >
            Tạo
          </button>
        </div>
        </div>
      </aside>
      <div className="grow">{current ? <MasterEditor key={current.name + current.updated_at} table={current} onSaved={list.reload} onDeleted={() => (setSel(null), list.reload())} /> : <div className="empty">Chưa có bảng master nào. Tạo bảng mới ở khung bên trái.</div>}</div>
    </section>
    </>
  );
}

function MasterEditor({ table, onSaved, onDeleted }: { table: MasterTable & { updated_by: string | null; updated_at: string | null }; onSaved: () => void; onDeleted: () => void }) {
  const [cols, setCols] = useState<string[]>(table.columns);
  const [rows, setRows] = useState<Scalar[][]>(table.rows);
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

  const save = async () => {
    try {
      const keys = rows.map((r) => String(r[0] ?? '').trim().toUpperCase()).filter(Boolean);
      const dup = keys.find((k, i) => keys.indexOf(k) !== i);
      if (dup) throw new Error(`Khoá "${dup}" ở cột đầu bị trùng`);
      await api.putMaster({ name: table.name, columns: cols, rows });
      setDirty(false);
      setMsg({ kind: 'ok', text: 'Đã lưu.' });
      onSaved();
    } catch (e) {
      setMsg({ kind: 'error', text: errMsg(e) });
    }
  };

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
          <span className="muted small">
            {rows.length} dòng · {cols.length} cột{table.updated_at ? ` · sửa lần cuối ${table.updated_by}, ${new Date(table.updated_at).toLocaleString('vi-VN')}` : ''}
          </span>
        </div>
      </div>
      <div className="card-body">
      <div className="toolbar">
        <button type="button" className="primary" disabled={!dirty} onClick={save}>
          Lưu
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
            if (!confirm(`Xoá bảng ${table.name}? Flow nào dùng bảng này sẽ không chạy được.`)) return;
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
