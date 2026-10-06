// 003 IN — Social / health / unemployment insurance (Form 02) and trade-union fund (Form 03) accrual.
import type { FlowConfig } from '../../src/engine/types.ts';
import { accrualLayout, aggregation, col, costItem, f, keyColumns, signerParams } from '../common.ts';

const SIGN_DATE =
  'TP. Cần Thơ, ngày 28 tháng {=TEXT(MONTH(EOMONTH(DATE(run.year, run.month, 0), 1)), "00")} năm {=YEAR(EOMONTH(DATE(run.year, run.month, 0), 1))}';

const amountColumns = [
  col('accrual', 'Số tiền trích kỳ này', 'Accrual amount this period', 'row.amount', 'number', 14.3),
  col('deduction', 'Phải thu CBNV', 'Deduction in employee salary', 'row.employeeAmount', 'number', 14.3),
  col('actual', 'Tổng cộng phải nộp', 'Actual accrual amount this period', '[accrual] + [deduction]', 'number', 14.3),
];

// Contribution base: 0 for retirees, foreigners and salary types other than (1)/(2); capped at 20 × base salary.
const base = (cap: string) =>
  `IF([retired] = 1, 0, IF(OR([foreign] = 1, AND(LEFT([salary_type], 3) <> "(1)", LEFT([salary_type], 3) <> "(2)")), 0, MIN([ins_salary], ${cap} * 20)))`;

export const IN: FlowConfig = {
  schemaVersion: 1,
  id: 'IN',
  name: 'IN — Trích BHXH, BHYT, BHTN, KPCĐ',
  ledger: 'shared',
  fileName: 'Form_IN_T{MM}.{YYYY}.xlsx',
  inputs: [
    {
      id: 'SalaryTable',
      label: 'Bảng lương (Salary Table)',
      required: true,
      key: 'emp_id',
      fields: [
        f('emp_id', 'Mã NV', 'text', true),
        f('dv', 'ĐV', 'text'),
        f('unit', 'Mã BP', 'text', true),
        f('ho', 'Họ', 'text'),
        f('ten', 'Tên', 'text'),
        f('pctn', 'PCTN'),
        f('basic', 'Lương CB'),
        f('position_coef', 'Hệ số VT'),
        f('position_salary', 'Lương VTCV'),
        f('toxic_salary', 'LgBH.Độc Hại'),
        f('foreign', 'Nước ngoài', 'text'),
        f('kbhxh', 'KBHXH', 'text'),
        f('salary_type', 'Lọai lương', 'text', true, ['Loại lương']),
      ],
    },
  ],
  runParams: signerParams(false),
  employeeTable: {
    source: 'SalaryTable',
    // Form 01 = UNIQUE(FILTER(Mã NV, Loại (1))) — salary types (1) and (2) only
    rowFilter: 'IN(LEFT(TRIM([salary_type]), 3), "(1)", "(2)")',
    columns: [
      { id: 'emp_id', label: 'Mã NV', formula: 'in.SalaryTable.emp_id', type: 'text' },
      { id: 'dv', label: 'Mã ĐV', formula: 'in.SalaryTable.dv', type: 'text' },
      { id: 'unit', label: 'Mã BP', formula: 'in.SalaryTable.unit', type: 'text' },
      { id: 'name', label: 'Họ và tên', formula: 'TRIM(in.SalaryTable.ho) & " " & TRIM(in.SalaryTable.ten)', type: 'text' },
      { id: 'salary_type', label: 'Loại lương', formula: 'in.SalaryTable.salary_type', type: 'text', show: false },
      { id: 'foreign', label: 'Nước ngoài', formula: 'IF(in.SalaryTable.foreign = 0, 0, 1)', type: 'number', show: false },
      { id: 'retired', label: 'Hưu', formula: 'IF([foreign] = 1, 0, IF(in.SalaryTable.kbhxh = "Checked", 1, 0))', type: 'number', show: false },
      { id: 'reserve', label: 'Lương bảo lưu', formula: 'in.SalaryTable.basic', type: 'number', show: false },
      {
        id: 'vtcv',
        label: 'Lương VTCV x HS',
        formula: 'ROUNDUP(in.SalaryTable.position_salary * IF(in.SalaryTable.position_coef = 0, 1, in.SalaryTable.position_coef), -3)',
        type: 'number',
        show: false,
      },
      { id: 'toxic', label: 'Lương NNDH', formula: 'in.SalaryTable.toxic_salary', type: 'number', show: false },
      { id: 'pctn', label: 'PCTN', formula: 'in.SalaryTable.pctn', type: 'number', show: false },
      { id: 'ins_salary', label: 'Lương BH', formula: 'MAX([reserve], [vtcv]) + [toxic] + [pctn]', type: 'number' },
      { id: 'base_si', label: 'Mức đóng BHXH', formula: base('P.LCS'), type: 'number' },
      { id: 'base_hi', label: 'Mức đóng BHYT', formula: base('P.LCS'), type: 'number' },
      { id: 'base_ui', label: 'Mức đóng BHTN', formula: base('P.TTV'), type: 'number' },
      { id: 'si_co', label: 'BHXH CTY', formula: '[base_si] * P.BHXH_CTY', type: 'number', show: false },
      { id: 'hi_co', label: 'BHYT CTY', formula: '[base_hi] * P.BHYT_CTY', type: 'number', show: false },
      { id: 'ui_co', label: 'BHTN CTY', formula: '[base_ui] * P.BHTN_CTY', type: 'number', show: false },
      { id: 'tu_co', label: 'KPCD CTY', formula: '[base_si] * P.KPCD_CTY', type: 'number', show: false },
      { id: 'si_emp', label: 'BHXH NLD', formula: 'ROUND([base_si] * P.BHXH_NLD, 0)', type: 'number' },
      { id: 'hi_emp', label: 'BHYT NLD', formula: 'ROUND([base_hi] * P.BHYT_NLD, 0)', type: 'number' },
      { id: 'ui_emp', label: 'BHTN NLD', formula: 'ROUND([base_ui] * P.BHTN_NLD, 0)', type: 'number' },
      { id: 'tu_emp', label: 'KPCD NLD', formula: '0', type: 'number', show: false },
      { id: 'c0312', label: '0312', formula: 'ROUND([si_co], 0)', type: 'number' },
      { id: 'c0313', label: '0313', formula: 'ROUND([hi_co], 0)', type: 'number' },
      { id: 'c0314', label: '0314', formula: 'ROUND([tu_co], 0)', type: 'number' },
      { id: 'c0315', label: '0315', formula: 'ROUNDUP([ui_co], -1)', type: 'number' },
    ],
  },
  costItems: [
    costItem('0312', 'Trích Bảo hiểm xã hội', 'HR', 'c0312', true, false, { employeeAmount: 'si_emp' }),
    costItem('0313', 'Trích Bảo hiểm y tế', 'HR', 'c0313', true, false, { employeeAmount: 'hi_emp' }),
    // Trade-union fund goes to the second form (workbook: Form 03 - Print = Helper 0314)
    costItem('0314', 'Trích Kinh phí công đoàn', 'HR', 'c0314', false, true, { employeeAmount: 'tu_emp' }),
    costItem('0315', 'Trích Bảo hiểm thất nghiệp', 'HR', 'c0315', true, false, { employeeAmount: 'ui_emp' }),
  ],
  aggregation: aggregation('NOT(CONTAINS(row.unit, "Z"))'),
  forms: {
    form02: {
      enabled: true,
      prefix: '',
      rowFilter: null,
      adjust: false, // PLAN §2: IN's payment side is still to be defined
      ledgerFeed: { sheet: 'none', amountColumn: 'accrual' },
      columns: [...keyColumns(), ...amountColumns],
      layout: accrualLayout(
        'Form 02 - Print',
        'BẢNG TỔNG HỢP TRÍCH BHXH - BHYT - BHTN THÁNG {MM}.{YYYY}',
        'SUMMARY TABLE OF SI - HI - UI ACCRUAL IN {MM}.{YYYY}',
        SIGN_DATE,
      ),
    },
    form03: {
      enabled: true,
      prefix: '',
      rowFilter: null,
      adjust: false,
      ledgerFeed: { sheet: 'none', amountColumn: 'accrual' },
      columns: [...keyColumns(), ...amountColumns],
      layout: accrualLayout(
        'Form 03 - Print',
        'BẢNG TỔNG HỢP TRÍCH KINH PHÍ CÔNG ĐOÀN THÁNG {MM}.{YYYY}',
        'SUMMARY TABLE OF TRADE UNION FUNDS ACCRUAL IN {MM}.{YYYY}',
        SIGN_DATE,
      ),
    },
  },
  checks: [
    { id: 'dup_emp', level: 'error', scope: 'employee', formula: 'COUNTIFS(in.SalaryTable.emp_id, [emp_id]) = 1', message: 'Mã NV xuất hiện nhiều lần trong Salary Table' },
    { id: 'blank_unit', level: 'error', scope: 'employee', formula: 'NOT(ISBLANK([unit]))', message: 'Nhân viên không có Mã BP' },
    {
      id: 'accrual_total',
      level: 'error',
      scope: 'total',
      formula: 'SUM(f02.accrual) + SUM(f03.accrual) = SUM(emp.c0312) + SUM(emp.c0313) + SUM(emp.c0314) + SUM(emp.c0315)',
      message: 'Tổng trích trên Form ≠ tổng 0312–0315 của bảng nhân viên (Form 02!J1)',
    },
    {
      id: 'deduction_total',
      level: 'error',
      scope: 'total',
      formula: 'SUM(f02.deduction) + SUM(f03.deduction) = SUM(emp.si_emp) + SUM(emp.hi_emp) + SUM(emp.ui_emp) + SUM(emp.tu_emp)',
      message: 'Tổng phải thu CBNV ≠ tổng phần NLĐ của bảng nhân viên (Form 02!K1)',
    },
  ],
  extraSheets: [
    {
      id: 'summary',
      name: 'Summary',
      title: 'TỔNG HỢP BHXH - BHYT - BHTN - KPCĐ THÁNG {MM}.{YYYY}',
      columns: [
        { header: 'TT', type: 'text', width: 5 },
        { header: 'Nội dung', type: 'text', width: 46 },
        { header: 'Số người', type: 'number', width: 9 },
        { header: 'Quỹ lương tính', type: 'number', width: 16 },
        { header: 'Tỷ lệ CTY', type: 'number', width: 9 },
        { header: 'Số tiền CTY', type: 'number', width: 16 },
        { header: 'Tỷ lệ NLD', type: 'number', width: 9 },
        { header: 'Số tiền NLD', type: 'number', width: 16 },
      ],
      rows: [
        { cells: ['"1"', '"BHXH / Social Insurance"', 'COUNTIFS(emp.base_si, ">0")', 'SUM(emp.base_si)', '0.14 + 0.03 + 0.005', 'SUM(emp.base_si) * (0.14 + 0.03 + 0.005)', '0.08', 'SUM(emp.base_si) * 0.08'] },
        { cells: ['"1.1"', '"Quỹ hưu trí, tử tuất / Retirement fund, Death fund"', 'COUNTIFS(emp.base_si, ">0")', 'SUM(emp.base_si)', '0.14', 'SUM(emp.base_si) * 0.14', '0.08', 'SUM(emp.base_si) * 0.08'] },
        { cells: ['"1.2"', '"Quỹ ốm đau, thai sản / Sick fund, Maternity fund"', 'COUNTIFS(emp.base_si, ">0")', 'SUM(emp.base_si)', '0.03', 'SUM(emp.base_si) * 0.03', '', '0'] },
        { cells: ['"1.3"', '"Quỹ TNLĐ, BNN / Insurance fund for occupational accidents and diseases"', 'COUNTIFS(emp.base_si, ">0")', 'SUM(emp.base_si)', '0.005', 'SUM(emp.base_si) * 0.005', '', '0'] },
        { cells: ['"2"', '"BHYT / Health Insurance"', 'COUNTIFS(emp.base_hi, ">0")', 'SUM(emp.base_hi)', '0.03', 'SUM(emp.base_hi) * 0.03', '0.015', 'SUM(emp.base_hi) * 0.015'] },
        { cells: ['"3"', '"BHTN / Unemployment insurance"', 'COUNTIFS(emp.base_ui, ">0")', 'SUM(emp.base_ui)', '0.01', 'SUM(emp.base_ui) * 0.01', '0.01', 'SUM(emp.base_ui) * 0.01'] },
        {
          cells: [
            '"Tổng (1,2,3)"',
            '"Total (1,2,3)"',
            '',
            'SUM(emp.base_si) + SUM(emp.base_hi) + SUM(emp.base_ui)',
            '0.175 + 0.03 + 0.01',
            'SUM(emp.base_si) * 0.175 + SUM(emp.base_hi) * 0.03 + SUM(emp.base_ui) * 0.01',
            '0.08 + 0.015 + 0.01',
            'SUM(emp.base_si) * 0.08 + SUM(emp.base_hi) * 0.015 + SUM(emp.base_ui) * 0.01',
          ],
        },
        { cells: ['"4"', '"KPCĐ / Trade Union Fee"', 'COUNTIFS(emp.base_si, ">0")', 'SUM(emp.base_si)', '0.02', 'SUM(emp.base_si) * 0.02', '', '0'] },
      ],
    },
  ],
};
