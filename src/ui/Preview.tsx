import { useMemo, useState } from 'react';
import type { FormOut, Issue, RunResult } from '../engine/run';
import type { FlowConfig, Scalar } from '../engine/types';
import { Alert, DataTable, Tabs, type GridColumn, type TabDef } from './common';
import { Card } from './layout';
import { RUN_MODE_LABEL } from '../engine/types';

export function IssueList({ issues }: { issues: Issue[] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!issues.length) return <Alert kind="ok">Không có lỗi hay cảnh báo nào.</Alert>;
  const errors = issues.filter((i) => i.level === 'error').length;
  return (
    <div className="issues">
      <div className="muted">
        {errors} lỗi, {issues.length - errors} cảnh báo
      </div>
      {issues.map((it, i) => (
        <div key={i} className={`issue issue-${it.level}`}>
          <div className="row gap">
            <span className="badge">{it.level === 'error' ? 'LỖI' : 'CẢNH BÁO'}</span>
            <span className="muted small">{it.source}</span>
            <span>{it.message}</span>
            {it.count > 1 && <span className="muted small">× {it.count}</span>}
            {it.keys.length > 0 && (
              <button type="button" className="link" onClick={() => setOpen(open === i ? null : i)}>
                {open === i ? 'ẩn' : 'xem dòng'}
              </button>
            )}
          </div>
          {open === i && (
            <div className="keys small">
              {it.keys.join(' · ')}
              {it.count > it.keys.length ? ` … và ${it.count - it.keys.length} dòng khác` : ''}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function formTable(f: FormOut) {
  const columns: GridColumn[] = f.def.columns.filter((c) => !f.hidden.includes(c.id)).map((c) => ({ id: c.id, label: c.headerVi, numeric: c.type === 'number' }));
  const rows = f.rows.map((r) => r.values);
  const footer: Record<string, Scalar> = { ...f.totals };
  for (const c of f.def.columns) if (c.total === false) footer[c.id] = null;
  const firstText = f.def.columns.find((c) => c.type === 'text');
  if (firstText) footer[firstText.id] = 'Tổng cộng';
  return { columns, rows, footer };
}

type Tab = 'issues' | 'emp' | 'f02' | 'f03' | 'totals' | `x${number}`;

export function Preview({ config, result }: { config: FlowConfig; result: RunResult }) {
  const [tab, setTab] = useState<Tab>('issues');
  const errors = result.issues.filter((i) => i.level === 'error').length;
  const tabs: TabDef<Tab>[] = [
    { id: 'issues', label: 'Kiểm tra', count: errors, tone: 'error' },
    { id: 'emp', label: 'Bảng nhân viên', count: result.employees.length },
  ];
  if (result.form02) tabs.push({ id: 'f02', label: 'Form 02', count: result.form02.rows.length });
  if (result.form03) tabs.push({ id: 'f03', label: 'Form 03', count: result.form03.rows.length });
  result.extraSheets.forEach((s, i) => tabs.push({ id: `x${i}`, label: s.def.name }));
  tabs.push({ id: 'totals', label: 'Tổng theo mã / đơn vị' });

  const empCols = useMemo(
    () => config.employeeTable.columns.filter((c) => c.show !== false).map((c) => ({ id: c.id, label: c.label || c.id, numeric: c.type === 'number' })),
    [config],
  );
  const empRows = useMemo(() => result.employees.map((e) => ({ _key: e.key, ...e.values })), [result]);

  return (
    <Card step={4} title={`Kết quả — kỳ ${result.period}${result.mode !== 'both' ? ` · ${RUN_MODE_LABEL[result.mode]}` : ''}`} className="result-card">
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <div className="tab-panel">
        {tab === 'issues' && <IssueList issues={result.issues} />}
        {tab === 'emp' && <DataTable columns={empCols} rows={empRows} />}
        {tab === 'f02' && result.form02 && <DataTable {...formTable(result.form02)} />}
        {tab === 'f03' && result.form03 && <DataTable {...formTable(result.form03)} />}
        {tab.startsWith('x') && <ExtraSheet sheet={result.extraSheets[Number(tab.slice(1))]} />}
        {tab === 'totals' && <Totals result={result} />}
      </div>
    </Card>
  );
}

function ExtraSheet({ sheet }: { sheet: RunResult['extraSheets'][number] }) {
  if (!sheet) return null;
  const columns = sheet.def.columns.map((c, i) => ({ id: String(i), label: c.header, numeric: c.type !== 'text' }));
  const rows = sheet.values.map((r) => Object.fromEntries(r.map((v, i) => [String(i), v])));
  return <DataTable columns={columns} rows={rows} />;
}

/** Totals per cost code and per unit — what the parallel run compares against Excel. */
function Totals({ result }: { result: RunResult }) {
  const group = (f: FormOut | null, by: 'costCode' | 'unit') => {
    if (!f) return null;
    const numCols = f.def.columns.filter((c) => c.type === 'number' && c.total !== false);
    const map = new Map<string, Record<string, Scalar>>();
    for (const r of f.rows) {
      const k = String(r.row[by]);
      let g = map.get(k);
      if (!g) {
        g = { key: k };
        for (const c of numCols) g[c.id] = 0;
        map.set(k, g);
      }
      for (const c of numCols) g[c.id] = (g[c.id] as number) + Number(r.values[c.id] ?? 0);
    }
    const columns = [{ id: 'key', label: by === 'costCode' ? 'Cost Code' : 'Unit' }, ...numCols.map((c) => ({ id: c.id, label: c.headerVi, numeric: true }))];
    const rows = [...map.values()].sort((a, b) => String(a.key).localeCompare(String(b.key)));
    return <DataTable columns={columns} rows={rows} footer={{ key: 'Tổng', ...result[f.id]!.totals }} pageSize={50} />;
  };
  return (
    <div>
      {result.form02 && (
        <>
          <h4>Form 02 theo Cost Code</h4>
          {group(result.form02, 'costCode')}
          <h4>Form 02 theo đơn vị</h4>
          {group(result.form02, 'unit')}
        </>
      )}
      {result.form03 && (
        <>
          <h4>Form 03 theo Cost Code</h4>
          {group(result.form03, 'costCode')}
          <h4>Form 03 theo đơn vị</h4>
          {group(result.form03, 'unit')}
        </>
      )}
    </div>
  );
}
