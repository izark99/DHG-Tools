// Quick start: build the first configuration of a flow from one sample payroll file. The admin picks
// the file, the header row is found, every column gets a guessed role (employee code, name, unit,
// amount → cost item, other value to read, skip) that the admin can change, and the input, employee
// table, cost items and unit grouping are generated. The file stays in the browser.
import { useMemo, useState } from 'react';
import { errMsg } from '../../api';
import { cellText, type Cell, type RawSheet } from '../../engine/inputs';
import type { CostItem, EmployeeColumn, FlowConfig, InputField, MasterTable } from '../../engine/types';
import { readSheets } from '../../excel/read';
import { Alert, FilePick, fmt } from '../common';
import { Icon, Modal } from '../layout';

type Role = 'key' | 'name' | 'unit' | 'amount' | 'field' | 'skip';
const ROLE_LABEL: Record<Role, string> = {
  key: 'Mã nhân viên',
  name: 'Họ tên',
  unit: 'Đơn vị',
  amount: 'Khoản tiền → tạo cost item',
  field: 'Đọc vào (dùng trong công thức)',
  skip: 'Bỏ qua',
};

interface Col {
  idx: number;
  header: string;
  id: string;
  numeric: boolean;
  example: Cell;
  total: number;
  role: Role;
  helper: string;
  costCode: string;
  nameVi: string;
  accrue: boolean;
  pay: boolean;
  budget: string;
}

const plain = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
const slug = (s: string) => {
  const x = plain(s)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30);
  return !x ? 'cot' : /^\d/.test(x) ? `c_${x}` : x;
};
const isNum = (c: Cell) => typeof c === 'number' || (typeof c === 'string' && /^-?[\d,.\s]+$/.test(c.trim()) && /\d/.test(c));
const toNum = (c: Cell) => (typeof c === 'number' ? c : Number(String(c).replace(/[,\s]/g, '')) || 0);

/** Row (in the first 30) with the most text cells: the header row. */
function findHeader(sheet: RawSheet): number {
  let best = 0;
  let score = -1;
  sheet.rows.slice(0, 30).forEach((r, i) => {
    const n = r.filter((c) => typeof c === 'string' && c.trim() && !isNum(c)).length;
    if (n > score) {
      score = n;
      best = i;
    }
  });
  return best;
}

function guessRole(h: string, numeric: boolean, taken: Set<Role>): Role {
  const p = plain(h);
  const pick = (r: Role) => (taken.has(r) ? null : (taken.add(r), r));
  if (/^(ma|so)\s*(nv|nhan vien|the)\b|ma nhan vien|^emp(loyee)?\s*(id|code|no)|^mnv$|^id$/.test(p)) return pick('key') ?? 'field';
  if (/ho\s*(va)?\s*ten|full\s*name|^ten nhan vien$|^ho$|^ten$/.test(p)) return pick('name') ?? 'skip';
  if (/don vi|bo phan|phong ban|^unit|department|^dept|^bp$/.test(p)) return pick('unit') ?? 'skip';
  return numeric ? 'field' : 'skip';
}

function analyse(sheet: RawSheet, headerRow: number): Col[] {
  const head = sheet.rows[headerRow] ?? [];
  const data = sheet.rows.slice(headerRow + 1, headerRow + 400);
  const taken = new Set<Role>();
  const ids = new Set<string>();
  const out: Col[] = [];
  head.forEach((h, idx) => {
    const header = cellText(h).replace(/\s+/g, ' ').trim();
    if (!header) return;
    const vals = data.map((r) => r[idx]).filter((c) => c !== null && c !== undefined && cellText(c).trim() !== '');
    const numeric = vals.length > 0 && vals.filter(isNum).length / vals.length >= 0.6;
    let id = slug(header);
    while (ids.has(id)) id += '_2';
    ids.add(id);
    out.push({
      idx,
      header,
      id,
      numeric,
      example: vals[0] ?? null,
      total: numeric ? vals.filter(isNum).reduce<number>((s, c) => s + toNum(c), 0) : 0,
      role: guessRole(header, numeric, taken),
      helper: id.toUpperCase(),
      costCode: '',
      nameVi: header,
      accrue: true,
      pay: true,
      budget: '',
    });
  });
  return out;
}

const find = (cols: string[], re: RegExp, fallback = '') => cols.find((c) => re.test(plain(c))) ?? fallback;

export function QuickStart({ cfg, masters, onApply, onClose }: { cfg: FlowConfig; masters: MasterTable[]; onApply: (patch: Partial<FlowConfig>, file: File) => void; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<RawSheet[]>([]);
  const [sheetName, setSheetName] = useState('');
  const [headerRow, setHeaderRow] = useState(0);
  const [cols, setCols] = useState<Col[]>([]);
  const [error, setError] = useState('');
  const [label, setLabel] = useState(cfg.inputs[0]?.label || 'Bảng lương');
  const unitGuess = masters.find((t) => /cost\s*center|don vi|unit/.test(plain(t.name)))?.name ?? masters[0]?.name ?? '';
  const [unitTable, setUnitTable] = useState(cfg.aggregation.costCenterTable && masters.some((t) => t.name === cfg.aggregation.costCenterTable) ? cfg.aggregation.costCenterTable : unitGuess);
  const unitCols = masters.find((t) => t.name === unitTable)?.columns ?? [];
  const [budget, setBudget] = useState('');

  const sheet = sheets.find((s) => s.name === sheetName);
  const load = async (f: File | undefined) => {
    setError('');
    if (!f) return;
    try {
      const all = await readSheets(f);
      // the sheet whose header row has the most titles
      const best = all.map((s) => ({ s, h: findHeader(s) })).sort((a, b) => (b.s.rows[b.h]?.length ?? 0) - (a.s.rows[a.h]?.length ?? 0))[0];
      if (!best) throw new Error('File không có sheet nào');
      setFile(f);
      setSheets(all);
      setSheetName(best.s.name);
      setHeaderRow(best.h);
      setCols(analyse(best.s, best.h));
    } catch (e) {
      setError(errMsg(e));
    }
  };
  const pickSheet = (name: string) => {
    const s = sheets.find((x) => x.name === name);
    if (!s) return;
    const h = findHeader(s);
    setSheetName(name);
    setHeaderRow(h);
    setCols(analyse(s, h));
  };
  const pickHeader = (h: number) => {
    if (!sheet) return;
    setHeaderRow(h);
    setCols(analyse(sheet, h));
  };
  const upd = (i: number, p: Partial<Col>) => setCols((cs) => cs.map((c, j) => (j === i ? { ...c, ...p } : c)));
  const setRole = (i: number, role: Role) =>
    // employee code, name and unit are single: taking one frees the column that had it
    setCols((cs) => cs.map((c, j) => (j === i ? { ...c, role } : ['key', 'name', 'unit'].includes(role) && c.role === role ? { ...c, role: c.numeric ? 'field' : 'skip' } : c)));

  const keyCol = cols.find((c) => c.role === 'key');
  const unitCol = cols.find((c) => c.role === 'unit');
  const amounts = cols.filter((c) => c.role === 'amount');
  const used = cols.filter((c) => c.role !== 'skip');
  const dupHelpers = useMemo(() => {
    const seen = new Set<string>();
    const dup = new Set<string>();
    for (const c of amounts) {
      const h = c.helper.trim().toUpperCase();
      if (seen.has(h)) dup.add(h);
      seen.add(h);
    }
    return dup;
  }, [amounts]);
  const problems = [
    !file && 'Chọn file lương mẫu.',
    file && !keyCol && 'Chọn cột Mã nhân viên.',
    file && !unitCol && 'Chọn cột Đơn vị.',
    amounts.some((c) => !c.helper.trim()) && 'Mỗi khoản tiền cần một Helper.',
    dupHelpers.size > 0 && `Helper bị trùng: ${[...dupHelpers].join(', ')}.`,
    amounts.some((c) => !(c.budget || budget).trim()) && 'Chọn Budget mặc định hoặc nhập Budget cho từng khoản.',
  ].filter(Boolean) as string[];

  const build = () => {
    if (!file || !keyCol || !unitCol) return;
    const I = cfg.inputs[0]?.id || 'SalaryTable';
    const fields: InputField[] = used.map((c) => ({
      id: c.id,
      label: c.header,
      type: c.numeric && c.role !== 'key' ? 'number' : 'text',
      required: c.role === 'key' || c.role === 'unit',
      aliases: [c.header],
    }));
    const empId = (c: Col) => (c.role === 'key' ? 'emp_id' : c.role === 'name' ? 'name' : c.role === 'unit' ? 'unit' : c.id);
    const order: Role[] = ['key', 'name', 'unit', 'field', 'amount'];
    const columns: EmployeeColumn[] = order.flatMap((r) =>
      used
        .filter((c) => c.role === r)
        .map((c) => ({
          id: empId(c),
          label: c.header,
          type: c.numeric && r !== 'key' && r !== 'name' && r !== 'unit' ? ('number' as const) : ('text' as const),
          formula: r === 'key' ? `in.${I}.${c.id}` : c.numeric && r !== 'name' && r !== 'unit' ? `SUMOF(in.${I}.${c.id})` : `FIRST(in.${I}.${c.id})`,
        })),
    );
    const costItems: CostItem[] = amounts.map((c) => ({
      helper: c.helper.trim(),
      costCode: c.costCode.trim(),
      nameVi: c.nameVi.trim() || c.header,
      nameEn: '',
      periodType: 'M',
      budget: (c.budget || budget).trim(),
      amount: empId(c),
      employeeAmount: null,
      accrue: c.accrue,
      pay: c.pay,
    }));
    const checks = [
      ...cfg.checks.filter((x) => x.id !== 'dup_emp' && x.id !== 'blank_unit'),
      { id: 'dup_emp', level: 'error' as const, scope: 'employee' as const, formula: 'COUNTSAME([emp_id]) = 1', message: 'Trùng mã nhân viên' },
      { id: 'blank_unit', level: 'error' as const, scope: 'employee' as const, formula: 'NOT(ISBLANK([unit]))', message: 'Nhân viên không có đơn vị' },
    ];
    onApply(
      {
        inputs: [{ id: I, label: label.trim() || 'Bảng lương', required: true, key: keyCol.id, sheet: sheets.length > 1 ? sheetName : undefined, fields }, ...cfg.inputs.slice(1)],
        employeeTable: { source: I, rowFilter: null, columns },
        costItems,
        checks,
        aggregation: {
          ...cfg.aggregation,
          unitColumn: 'unit',
          costCenterTable: unitTable || cfg.aggregation.costCenterTable,
          deptColumn: find(unitCols, /dept|phong/, cfg.aggregation.deptColumn),
          costCenterColumn: find(unitCols, /cost\s*center|^cc$|trung tam/, cfg.aggregation.costCenterColumn),
          sectorColumn: find(unitCols, /sector|khoi/, cfg.aggregation.sectorColumn),
        },
      },
      file,
    );
  };

  const replaces = cfg.costItems.length > 0 || cfg.employeeTable.columns.length > 2;
  return (
    <Modal
      wide
      title="Bắt đầu nhanh từ file lương mẫu"
      onClose={onClose}
      footer={
        <>
          <span className="muted small qs-summary">
            {file ? `Sẽ tạo: 1 file đầu vào (${used.length} cột), bảng nhân viên (${used.length} cột), ${amounts.length} cost item.` : 'File chỉ đọc trên máy này, không gửi lên server.'}
          </span>
          <button type="button" onClick={onClose}>
            Huỷ
          </button>
          <button type="button" className="primary" disabled={problems.length > 0} onClick={build} title={problems.join(' ')}>
            <Icon name="check" size={16} /> Tạo cấu hình
          </button>
        </>
      }
    >
      <div className="qs">
        <section>
          <h4>
            <span className="step-no">1</span> Chọn một file lương của một tháng bất kỳ
          </h4>
          <FilePick
            label="File lương mẫu"
            accept=".xlsx,.xlsm"
            fileName={file?.name}
            status={sheet ? `${file?.name} · sheet ${sheetName} · tiêu đề ở dòng ${headerRow + 1}` : undefined}
            onFile={load}
          />
          {error && <Alert kind="error">{error}</Alert>}
          {sheet && (
            <div className="qs-row">
              <label>
                <span>Tên file khi người dùng chạy</span>
                <input value={label} onChange={(e) => setLabel(e.target.value)} />
              </label>
              {sheets.length > 1 && (
                <label>
                  <span>Sheet</span>
                  <select value={sheetName} onChange={(e) => pickSheet(e.target.value)}>
                    {sheets.map((s) => (
                      <option key={s.name}>{s.name}</option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                <span>Dòng tiêu đề cột</span>
                <select value={headerRow} onChange={(e) => pickHeader(Number(e.target.value))}>
                  {sheet.rows.slice(0, 30).map((r, i) => (
                    <option key={i} value={i}>
                      Dòng {i + 1}: {r.map((c) => cellText(c)).filter(Boolean).slice(0, 4).join(' | ').slice(0, 60)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </section>

        {cols.length > 0 && (
          <section>
            <h4>
              <span className="step-no">2</span> Mỗi cột trong file dùng để làm gì?
            </h4>
            <p className="muted small">
              Đã đoán sẵn — chỉ cần sửa chỗ sai. Bắt buộc có <b>Mã nhân viên</b> và <b>Đơn vị</b>. Cột chọn <b>Khoản tiền</b> sẽ thành một cost item (một dòng trên Form 02 / 03).
              Cột <b>Đọc vào</b> dùng được trong công thức sau này.
            </p>
            <div className="qs-tools">
              <button type="button" className="sm" onClick={() => setCols((cs) => cs.map((c) => (c.numeric && c.role === 'field' ? { ...c, role: 'amount' } : c)))}>
                Mọi cột số "Đọc vào" → Khoản tiền
              </button>
              <button type="button" className="sm" onClick={() => setCols((cs) => cs.map((c) => (c.role === 'amount' ? { ...c, role: 'field' } : c)))}>
                Bỏ chọn mọi khoản tiền
              </button>
            </div>
            <div className="table-wrap qs-table">
              <table className="grid compact">
                <thead>
                  <tr>
                    <th>Cột trong file</th>
                    <th>Ví dụ</th>
                    <th className="num">Tổng cột</th>
                    <th>Dùng để</th>
                  </tr>
                </thead>
                <tbody>
                  {cols.map((c, i) => (
                    <tr key={c.idx} className={c.role === 'skip' ? 'muted' : undefined}>
                      <td data-no-text-edit="">{c.header}</td>
                      <td data-no-text-edit="">{c.example === null ? '—' : fmt(c.example instanceof Date ? c.example.toLocaleDateString('vi-VN') : (c.example as string | number))}</td>
                      <td className="num" data-no-text-edit="">
                        {c.numeric ? fmt(Math.round(c.total)) : ''}
                      </td>
                      <td>
                        <select value={c.role} onChange={(e) => setRole(i, e.target.value as Role)} aria-label={`Vai trò cột ${c.header}`}>
                          {(Object.keys(ROLE_LABEL) as Role[])
                            .filter((r) => r !== 'amount' || c.numeric || c.role === 'amount')
                            .map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABEL[r]}
                              </option>
                            ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {amounts.length > 0 && (
          <section>
            <h4>
              <span className="step-no">3</span> Các khoản tiền → cost item
            </h4>
            <p className="muted small">
              Helper là mã khoản dùng trên form và ledger (không trùng nhau). Cost code là mã chi phí kế toán — chưa biết thì để trống, điền sau ở bước Cost items.
            </p>
            <div className="qs-row">
              <label>
                <span>Bảng đơn vị (master data)</span>
                <select value={unitTable} onChange={(e) => setUnitTable(e.target.value)}>
                  {!masters.length && <option value="">— chưa có master data —</option>}
                  {masters.map((t) => (
                    <option key={t.name}>{t.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Budget mặc định cho mọi khoản</span>
                <input list="qs-budget" value={budget} placeholder="cột của bảng đơn vị hoặc mã cố định" onChange={(e) => setBudget(e.target.value)} />
                <datalist id="qs-budget">
                  {unitCols.slice(1).map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </label>
            </div>
            <div className="table-wrap qs-table">
              <table className="grid compact edit">
                <thead>
                  <tr>
                    <th>Cột</th>
                    <th>Helper</th>
                    <th>Cost code</th>
                    <th>Tên khoản</th>
                    <th>Budget riêng</th>
                    <th className="ta-center">Trích · F02</th>
                    <th className="ta-center">Chi · F03</th>
                  </tr>
                </thead>
                <tbody>
                  {cols.map(
                    (c, i) =>
                      c.role === 'amount' && (
                        <tr key={c.idx} className={dupHelpers.has(c.helper.trim().toUpperCase()) || !c.helper.trim() ? 'row-error' : undefined}>
                          <td data-no-text-edit="">{c.header}</td>
                          <td>
                            <input className="cell" value={c.helper} onChange={(e) => upd(i, { helper: e.target.value })} aria-label={`Helper của ${c.header}`} />
                          </td>
                          <td>
                            <input className="cell" value={c.costCode} onChange={(e) => upd(i, { costCode: e.target.value })} aria-label={`Cost code của ${c.header}`} />
                          </td>
                          <td>
                            <input className="cell" value={c.nameVi} onChange={(e) => upd(i, { nameVi: e.target.value })} aria-label={`Tên khoản của ${c.header}`} />
                          </td>
                          <td>
                            <input className="cell" list="qs-budget" value={c.budget} placeholder={budget || '—'} onChange={(e) => upd(i, { budget: e.target.value })} />
                          </td>
                          <td className="ta-center">
                            <input type="checkbox" checked={c.accrue} onChange={(e) => upd(i, { accrue: e.target.checked })} aria-label={`${c.header} vào Form 02`} />
                          </td>
                          <td className="ta-center">
                            <input type="checkbox" checked={c.pay} onChange={(e) => upd(i, { pay: e.target.checked })} aria-label={`${c.header} vào Form 03`} />
                          </td>
                        </tr>
                      ),
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {file && problems.length > 0 && (
          <Alert kind="warning">
            Còn thiếu: {problems.join(' ')}
          </Alert>
        )}
        {file && replaces && <Alert kind="info">Flow này đã có cấu hình: File đầu vào, Bảng nhân viên và Cost items sẽ được thay bằng phần mới tạo (chưa lưu cho tới khi bấm Lưu nháp).</Alert>}
      </div>
    </Modal>
  );
}
