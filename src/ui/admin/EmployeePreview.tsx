// Preview of the employee table (Form 01) in the flow editor: one row per employee, one column per
// employee-table column, with the sample payroll data run through the draft configuration.
// Search, totals, the followed employee highlighted; a click on a header opens that column.
import { useMemo, useState } from 'react';
import type { RunResult } from '../../engine/run';
import type { EmployeeColumn } from '../../engine/types';
import { fmt } from '../common';
import { sumBy } from './Sample';

const PAGE = 50;

export function EmployeePreview({
  cols,
  result,
  empKey,
  onPickEmp,
  onColumn,
  onLoadSample,
}: {
  cols: EmployeeColumn[];
  result: RunResult | null;
  empKey: string;
  onPickEmp: (key: string) => void;
  onColumn: (index: number) => void;
  onLoadSample: () => void;
}) {
  const [onlyShown, setOnlyShown] = useState(false);
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const shown = cols.map((c, i) => ({ c, i })).filter(({ c }) => !onlyShown || c.show !== false);
  const emps = result?.employees ?? [];
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return emps;
    return emps.filter((e) => e.key.toLowerCase().includes(s) || Object.values(e.values).some((v) => v !== null && String(v).toLowerCase().includes(s)));
  }, [emps, q]);
  const hiddenCount = cols.filter((c) => c.show === false).length;

  return (
    <div className="emp-preview">
      <div className="toolbar">
        {result ? (
          <>
            <input className="search" placeholder="Tìm mã, tên, giá trị…" value={q} onChange={(e) => (setQ(e.target.value), setLimit(PAGE))} aria-label="Tìm trong bảng nhân viên" />
            <span className="muted small">
              {rows.length} / {emps.length} nhân viên
            </span>
          </>
        ) : (
          <span className="muted small">Chưa có dữ liệu mẫu — đang hiện khung cột.</span>
        )}
        <span className="spacer" />
        {hiddenCount > 0 && (
          <label className="check small">
            <input type="checkbox" checked={onlyShown} onChange={(e) => setOnlyShown(e.target.checked)} /> Chỉ cột người chạy thấy ({cols.length - hiddenCount}/{cols.length})
          </label>
        )}
        {!result && (
          <button type="button" className="sm" onClick={onLoadSample}>
            Nạp dữ liệu mẫu
          </button>
        )}
      </div>
      <div className="table-wrap emp-preview-wrap">
        <table className="grid compact">
          <thead>
            <tr>
              <th className="ge-no">#</th>
              {shown.map(({ c, i }) => (
                <th key={c.id} className={c.type === 'number' ? 'num' : undefined} title={`[${c.id}] — bấm để sửa công thức`} onClick={() => onColumn(i)}>
                  <span className="emp-th">
                    <span>{c.label || c.id}</span>
                    <code data-no-text-edit="">{c.id}</code>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody data-no-text-edit="">
            {result
              ? rows.slice(0, limit).map((e, n) => (
                  <tr key={e.key} className={e.key === empKey ? 'selected' : undefined} onClick={() => onPickEmp(e.key)} title="Bấm để theo dõi nhân viên này ở các bước">
                    <td className="ge-no">{n + 1}</td>
                    {shown.map(({ c }) => (
                      <td key={c.id} className={c.type === 'number' ? 'num' : undefined}>
                        {fmt(e.values[c.id] ?? null)}
                      </td>
                    ))}
                  </tr>
                ))
              : [0, 1, 2].map((k) => (
                  <tr key={k} className="muted">
                    <td className="ge-no">{k + 1}</td>
                    {shown.map(({ c }) => (
                      <td key={c.id} className={c.type === 'number' ? 'num' : undefined}>
                        {c.type === 'number' ? '0' : '…'}
                      </td>
                    ))}
                  </tr>
                ))}
            {result && !rows.length && (
              <tr>
                <td colSpan={shown.length + 1} className="ge-empty">
                  Không có nhân viên nào khớp.
                </td>
              </tr>
            )}
          </tbody>
          {result && rows.length > 0 && (
            <tfoot data-no-text-edit="">
              <tr>
                <td className="ge-no">Σ</td>
                {shown.map(({ c }) => (
                  <td key={c.id} className={c.type === 'number' ? 'num' : undefined}>
                    {c.type === 'number' ? fmt(sumBy(rows, (e) => e.values[c.id]) ?? 0) : ''}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {result && rows.length > limit && (
        <button type="button" className="ge-add" onClick={() => setLimit(limit + PAGE)}>
          Xem thêm {Math.min(PAGE, rows.length - limit)} dòng (còn {rows.length - limit})
        </button>
      )}
    </div>
  );
}
