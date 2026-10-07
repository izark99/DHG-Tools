import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Scalar } from '../engine/types';

export function download(data: ArrayBuffer | Blob | string, fileName: string, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function fmt(v: Scalar | undefined): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return v.toLocaleString('en-US', { maximumFractionDigits: 4 });
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return v;
}

export function Alert({ kind, children }: { kind: 'error' | 'warning' | 'info' | 'ok'; children: ReactNode }) {
  return <div className={`alert alert-${kind}`}>{children}</div>;
}

export interface TabDef<T extends string> {
  id: T;
  label: ReactNode;
  /** small counter after the label; fixed-width so labels never move */
  count?: number;
  tone?: 'error' | 'neutral';
}

/** Tab bar with a fixed height and no font-weight change on the active tab (no layout shift). */
export function Tabs<T extends string>({ tabs, value, onChange, vertical }: { tabs: TabDef<T>[]; value: T; onChange: (t: T) => void; vertical?: boolean }) {
  return (
    <div className={vertical ? 'tabs vertical' : 'tabs'} role="tablist" aria-orientation={vertical ? 'vertical' : 'horizontal'}>
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={t.id === value} className={t.id === value ? 'tab active' : 'tab'} onClick={() => onChange(t.id)}>
          <span>{t.label}</span>
          {t.count !== undefined && (
            <span className={`tab-count${t.tone === 'error' ? (t.count > 0 ? ' tab-count-error' : ' zero') : ''}`} aria-hidden={t.tone === 'error' && t.count === 0}>
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export interface GridColumn {
  id: string;
  label: string;
  numeric?: boolean;
}

/** Read-only table with paging (large payroll previews stay responsive). */
export function DataTable({ columns, rows, pageSize = 100, footer }: { columns: GridColumn[]; rows: Record<string, Scalar>[]; pageSize?: number; footer?: Record<string, Scalar> }) {
  const [page, setPage] = useState(0);
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const s = q.trim().toLowerCase();
    return rows.filter((r) => columns.some((c) => String(r[c.id] ?? '').toLowerCase().includes(s)));
  }, [rows, columns, q]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  useEffect(() => setPage(0), [q, rows]);
  const slice = filtered.slice(page * pageSize, (page + 1) * pageSize);
  return (
    <div>
      <div className="toolbar">
        <input className="search" placeholder="Tìm…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="muted small">{filtered.length} dòng</span>
        <span className="spacer" />
        <span className="pager">
          <button type="button" className="icon-btn" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Trang trước">
            ‹
          </button>
          <span className="small">
            {page + 1}/{pages}
          </span>
          <button type="button" className="icon-btn" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label="Trang sau">
            ›
          </button>
        </span>
      </div>
      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.id}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((r, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c.id} className={c.numeric ? 'num' : undefined}>
                    {fmt(r[c.id])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {footer && (
            <tfoot>
              <tr>
                {columns.map((c) => (
                  <td key={c.id} className={c.numeric ? 'num' : undefined}>
                    {fmt(footer[c.id])}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | null; error: string | null; loading: boolean; reload: () => void } {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    fn().then(
      (data) => alive && setState({ data, error: null, loading: false }),
      (e) => alive && setState({ data: null, error: e instanceof Error ? e.message : String(e), loading: false }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { ...state, reload: () => setN((x) => x + 1) };
}

export function readFileText(file: File): Promise<string> {
  return file.text();
}
