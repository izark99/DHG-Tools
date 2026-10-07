// First screen of the flow editor: what the flow does as a pipeline (file → employee table → cost
// items → units → forms → ledger), the setup steps with their state, and the cost item matrix
// (which item goes to which form), all clickable to jump to the place to edit.
import type { ReactNode } from 'react';
import { formPhase, type CostItem, type FlowConfig } from '../../engine/types';
import type { ConfigError } from '../../engine/validate';
import { fmt } from '../common';
import { Icon } from '../layout';
import type { Sample } from './Sample';
import { sumBy } from './Sample';

export interface Step {
  id: string;
  no?: number;
  label: string;
  /** one plain sentence: what this step decides */
  hint: string;
  prefix?: string | readonly string[];
  optional?: boolean;
  done?: (cfg: FlowConfig) => boolean;
}

const LEDGER_LABEL = { none: 'không ghi', accrual: 'ghi số trích', actual: 'ghi số chi', both: 'ghi trích = chi' } as const;

function Node({ title, value, sub, errors, onClick, off, tone }: { title: string; value: ReactNode; sub?: ReactNode; errors: number; onClick: () => void; off?: boolean; tone?: string }) {
  return (
    <button type="button" className={`ov-node${errors ? ' bad' : ''}${off ? ' off' : ''}${tone ? ` ${tone}` : ''}`} onClick={onClick}>
      <span className="ov-node-title">
        {title}
        {errors > 0 && <span className="tab-count tab-count-error">{errors}</span>}
      </span>
      <span className="ov-node-value">{value}</span>
      {sub && <span className="ov-node-sub">{sub}</span>}
    </button>
  );
}

const Arrow = () => (
  <span className="ov-arrow" aria-hidden="true">
    <Icon name="arrow" size={16} />
  </span>
);

export function Overview({
  cfg,
  errors,
  steps,
  sample,
  go,
  setCostItems,
}: {
  cfg: FlowConfig;
  errors: ConfigError[];
  steps: Step[];
  sample: Sample;
  go: (tab: string, focus?: number) => void;
  setCostItems: (items: CostItem[]) => void;
}) {
  const r = sample.result;
  const count = (prefix: string | readonly string[]) => errors.filter((e) => (typeof prefix === 'string' ? [prefix] : prefix).some((p) => e.path.startsWith(p))).length;
  const fields = cfg.inputs.reduce((n, i) => n + i.fields.length, 0);
  const amountCols = new Set(cfg.costItems.map((c) => c.amount).filter(Boolean));
  const form = (id: 'form02' | 'form03') => {
    const f = cfg.forms[id];
    const out = r?.[id];
    const ledger = LEDGER_LABEL[f.ledgerFeed?.sheet ?? 'none'];
    return (
      <Node
        title={`${id === 'form02' ? 'Form 02' : 'Form 03'} · ${formPhase(id, f) === 'accrual' ? 'Trích' : 'Chi'}`}
        value={f.enabled ? (out ? `${out.rows.length} dòng` : `${f.columns.filter((c) => !c.hidden).length} cột in`) : 'không xuất'}
        sub={f.enabled ? (out ? `Tổng ${fmt(out.totals[f.ledgerFeed?.amountColumn] ?? sumBy(out.rows, (x) => x.row.amount) ?? 0)}` : `Ledger: ${ledger}`) : undefined}
        errors={count(`forms.${id}`)}
        off={!f.enabled}
        onClick={() => go(id)}
      />
    );
  };
  const feeds = (['form02', 'form03'] as const).filter((id) => cfg.forms[id].enabled && (cfg.forms[id].ledgerFeed?.sheet ?? 'none') !== 'none');
  const itemTotal = (c: CostItem) => (r ? sumBy(r.aggRows.filter((a) => a.helper === c.helper), (a) => a.amount) : null);
  const update = (i: number, patch: Partial<CostItem>) => setCostItems(cfg.costItems.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <div className="overview">
      <section>
        <h3 className="section-title">Flow này chạy thế nào</h3>
        <p className="muted small">Mỗi ô là một bước, đi từ trái sang phải. Bấm vào ô để sửa bước đó.{!sample.on && ' Nạp dữ liệu mẫu (thanh phía trên) để thấy số liệu thật ở từng bước.'}</p>
        <div className="ov-pipe">
          <Node
            title="File đầu vào"
            value={`${cfg.inputs.length} file`}
            sub={r ? `${Object.values(sample.parsed).reduce((n, p) => n + (p.data?.rows.length ?? 0), 0)} dòng đã đọc` : `${fields} cột cần đọc`}
            errors={count('inputs')}
            onClick={() => go('inputs')}
          />
          <Arrow />
          <Node
            title="Bảng nhân viên"
            value={r ? `${r.employees.length} nhân viên` : `${cfg.employeeTable.columns.length} cột tính`}
            sub={r ? `${cfg.employeeTable.columns.length} cột tính` : 'mỗi mã NV một dòng'}
            errors={count('employeeTable')}
            onClick={() => go('employee')}
          />
          <Arrow />
          <Node
            title="Cost items"
            value={`${cfg.costItems.length} cost item`}
            sub={`lấy từ ${amountCols.size} cột số tiền`}
            errors={count('costItems')}
            onClick={() => go('cost')}
          />
          <Arrow />
          <Node
            title="Gộp theo đơn vị"
            value={r ? `${r.aggRows.length} dòng` : cfg.aggregation.costCenterTable || '—'}
            sub="theo đơn vị, cost center, helper"
            errors={count('aggregation')}
            onClick={() => go('agg')}
          />
          <Arrow />
          <div className="ov-stack">
            {form('form02')}
            {form('form03')}
          </div>
          <Arrow />
          <Node
            title="Ledger"
            value={feeds.length ? feeds.map((id) => (id === 'form02' ? 'F02' : 'F03')).join(' + ') : 'không dùng'}
            sub={feeds.length ? `sổ "${cfg.ledger || 'shared'}"` : undefined}
            errors={0}
            off={!feeds.length}
            onClick={() => go(feeds[0] ?? 'form02')}
          />
        </div>
      </section>

      <section>
        <h3 className="section-title">Các bước thiết lập</h3>
        <ol className="ov-steps">
          {steps
            .filter((s) => s.no)
            .map((s) => {
              const n = s.prefix ? count(s.prefix) : 0;
              const done = s.done ? s.done(cfg) : true;
              const state = n ? 'bad' : done ? 'ok' : s.optional ? 'skip' : 'todo';
              return (
                <li key={s.id} className={`ov-step ${state}`}>
                  <button type="button" onClick={() => go(s.id)}>
                    <span className="ov-step-no">{state === 'ok' ? <Icon name="check" size={14} /> : s.no}</span>
                    <span className="ov-step-text">
                      <strong>{s.label}</strong>
                      <span className="muted small">{s.hint}</span>
                    </span>
                    <span className="ov-step-state small">{n ? `${n} lỗi` : state === 'ok' ? 'xong' : s.optional ? 'tuỳ chọn' : 'cần làm'}</span>
                  </button>
                </li>
              );
            })}
        </ol>
      </section>

      <section>
        <h3 className="section-title">Ma trận cost item</h3>
        <p className="muted small">Mỗi dòng là một khoản chi phí: lấy số tiền từ cột nào của bảng nhân viên và đi vào form nào. Đánh dấu trực tiếp tại đây; bấm vào Helper để sửa chi tiết.</p>
        <div className="table-wrap">
          <table className="grid compact ov-matrix">
            <thead>
              <tr>
                <th>Helper</th>
                <th>Tên khoản</th>
                <th>Lấy số tiền từ cột</th>
                <th>Kỳ</th>
                <th className="center">Trích · Form 02</th>
                <th className="center">Chi · Form 03</th>
                {r && <th className="num">Tổng mẫu</th>}
              </tr>
            </thead>
            <tbody>
              {cfg.costItems.map((c, i) => {
                const bad = errors.some((e) => e.path.startsWith(`costItems[${i}]`));
                const t = itemTotal(c);
                return (
                  <tr key={i} className={bad ? 'row-error' : undefined}>
                    <td>
                      <button type="button" className="link" onClick={() => go('cost', i)}>
                        {c.helper || `(dòng ${i + 1})`}
                      </button>
                    </td>
                    <td>{c.nameVi}</td>
                    <td>{c.amount ? <code>{c.amount}</code> : <span className="muted">— (chỉ để tra cứu)</span>}</td>
                    <td>{c.periodType}</td>
                    <td className="center">
                      <input type="checkbox" aria-label={`${c.helper} vào Form 02`} checked={c.accrue} onChange={(e) => update(i, { accrue: e.target.checked })} />
                    </td>
                    <td className="center">
                      <input type="checkbox" aria-label={`${c.helper} vào Form 03`} checked={c.pay} onChange={(e) => update(i, { pay: e.target.checked })} />
                    </td>
                    {r && <td className="num">{t === null ? '—' : fmt(t)}</td>}
                  </tr>
                );
              })}
              {!cfg.costItems.length && (
                <tr>
                  <td colSpan={r ? 7 : 6} className="ge-empty">
                    Chưa có cost item — thêm ở bước Cost items.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
