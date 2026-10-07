import { proposeMapping, readInput, type RawSheet } from '../engine/inputs';
import type { FlowConfig, FormDef, MasterTable } from '../engine/types';

// Small synthetic fixture — every code here is test data, not application logic.
export const masters: Record<string, MasterTable> = {
  CostCenter: {
    name: 'CostCenter',
    columns: ['Unit', 'Dept', 'Cost Center', 'Sector', 'HR', 'AT'],
    rows: [
      ['U1', 'D1', 'CC1', 'DHG', 'HR100', 'AT100'],
      ['U2', 'D2', 'CC2', 'KBH', 'HR200', 'AT200'],
      ['UZ9', 'D9', 'CC9', 'KBH', 'HR900', 'AT900'],
    ],
  },
  Params: { name: 'Params', columns: ['key', 'value'], rows: [['si_rate', '0.175']] },
};

const layout = (sheetName: string) => ({
  sheetName,
  companyName: 'CÔNG TY TEST',
  titleVi: 'BẢNG TEST - THÁNG {MM}.{YYYY}',
  titleEn: 'TEST - {MM}.{YYYY}',
  signatures: [{ title: 'Người lập', nameParam: 'preparer' }],
});

export function config(over: Partial<FlowConfig> = {}): FlowConfig {
  const form02: FormDef = {
    enabled: true,
    prefix: 'Trích',
    adjust: true,
    ledgerFeed: { sheet: 'accrual', amountColumn: 'accrual' },
    columns: [
      { id: 'no', headerVi: 'STT', headerEn: 'No', formula: 'row.no', type: 'number', total: false },
      { id: 'desc', headerVi: 'Diễn giải', headerEn: 'Description', formula: 'row.description', type: 'text' },
      { id: 'accrual', headerVi: 'Trích kỳ này', headerEn: 'Accrual', formula: 'row.amount', type: 'number' },
      { id: 'adj', headerVi: 'Điều chỉnh', headerEn: 'Adjusted', formula: 'row.adjusted', type: 'number' },
      { id: 'actual', headerVi: 'Thực trích', headerEn: 'Actual accrual', formula: '[accrual]+[adj]', type: 'number' },
    ],
    layout: layout('Form 02'),
  };
  const form03: FormDef = {
    enabled: true,
    prefix: 'Chi',
    adjust: false,
    ledgerFeed: { sheet: 'actual', amountColumn: 'gross' },
    columns: [
      { id: 'no', headerVi: 'STT', headerEn: 'No', formula: 'row.no', type: 'number', total: false },
      { id: 'desc', headerVi: 'Diễn giải', headerEn: 'Description', formula: 'row.description', type: 'text' },
      { id: 'gross', headerVi: 'Tổng', headerEn: 'Gross', formula: 'row.amount', type: 'number' },
      { id: 'si', headerVi: 'BHXH', headerEn: 'SI', formula: 'IF(row.costCode IN ("0301"), UNITSUM(emp.si), 0)', type: 'number' },
      { id: 'pit', headerVi: 'TNCN', headerEn: 'PIT', formula: 'IF(row.costCode = "0301", UNITSUM(emp.pit), 0)', type: 'number' },
      { id: 'loan', headerVi: 'Vay', headerEn: 'Loan', formula: '0', type: 'number', hideIfZeroTotal: true },
      { id: 'net', headerVi: 'Thực lãnh', headerEn: 'Take-home', formula: '[gross]-[si]-[pit]-[loan]', type: 'number' },
    ],
    layout: layout('Form 03'),
  };
  return {
    schemaVersion: 1,
    id: 'T1',
    name: 'Test flow',
    fileName: 'Form_T1_T{MM}.{YYYY}.xlsx',
    inputs: [
      {
        id: 'SalaryTable',
        label: 'Bảng lương',
        required: true,
        key: 'emp_id',
        fields: [
          { id: 'emp_id', type: 'text', required: true, aliases: ['Mã NV'] },
          { id: 'name', type: 'text', aliases: ['Họ'] },
          { id: 'unit', type: 'text', required: true, aliases: ['Đơn vị'] },
          { id: 'basic', type: 'number', aliases: ['Lương thời gian'] },
          { id: 'bonus', type: 'number', aliases: ['Thưởng'] },
          { id: 'allowance', type: 'number', aliases: ['Phụ cấp'] },
          { id: 'si', type: 'number', aliases: ['BHXH NV'] },
          { id: 'pit', type: 'number', aliases: ['Thuế TNCN'] },
          { id: 'paid', type: 'number', aliases: ['Thực chi'] },
        ],
      },
    ],
    runParams: [{ id: 'preparer', label: 'Người lập', type: 'text' }],
    employeeTable: {
      source: 'SalaryTable',
      rowFilter: null,
      columns: [
        { id: 'emp_id', label: 'Mã NV', formula: 'in.SalaryTable.emp_id', type: 'text' },
        { id: 'unit', label: 'Đơn vị', formula: 'FIRST(in.SalaryTable.unit)', type: 'text' },
        { id: 'basic', label: 'Lương', formula: 'SUMOF(in.SalaryTable.basic)', type: 'number' },
        { id: 'bonusQ', label: 'Thưởng quý', formula: 'in.SalaryTable.bonus', type: 'number' },
        { id: 'allow', label: 'Phụ cấp', formula: 'in.SalaryTable.allowance', type: 'number' },
        { id: 'ins', label: 'BH công ty', formula: 'ROUND([basic] * P.si_rate, 0)', type: 'number' },
        { id: 'si', label: 'BHXH NV', formula: 'in.SalaryTable.si', type: 'number' },
        { id: 'pit', label: 'TNCN', formula: 'in.SalaryTable.pit', type: 'number' },
        { id: 'paid', label: 'Thực chi', formula: 'in.SalaryTable.paid', type: 'number' },
      ],
    },
    costItems: [
      { helper: '0301_LT', costCode: '0301', nameVi: 'Lương thời gian', periodType: 'M', budget: 'HR', amount: 'basic', accrue: true, pay: true },
      { helper: '0317Q_ST', costCode: '0317', nameVi: 'Thưởng quý', periodType: 'Q', budget: 'AT', amount: 'bonusQ', accrue: true, pay: false },
      { helper: '0319_PC', costCode: '0319', nameVi: 'Phụ cấp', periodType: 'M', budget: 'BUD999', amount: 'allow', accrue: true, pay: true },
      { helper: '0401_BH', costCode: '0401', nameVi: 'BHXH công ty', periodType: 'M', budget: 'HR', amount: 'ins', accrue: true, pay: false },
    ],
    aggregation: {
      unitColumn: 'unit',
      costCenterTable: 'CostCenter',
      deptColumn: 'Dept',
      costCenterColumn: 'Cost Center',
      sectorColumn: 'Sector',
      unitFilter: 'NOT(CONTAINS(row.unit, "Z"))',
      descriptionTemplate: '{prefix} {name}_{period}_{dept}-{unit}',
    },
    forms: { form02, form03 },
    checks: [
      { id: 'dup', level: 'error', scope: 'employee', formula: 'COUNTSAME([emp_id]) = 1', message: 'Trùng mã nhân viên' },
      { id: 'pit_total', level: 'error', scope: 'total', formula: 'SUM(f03.pit) = SUM(in.SalaryTable.pit)', message: 'TNCN phân bổ ≠ tổng TNCN' },
      { id: 'one_pit_row', level: 'warning', scope: 'form03', formula: 'UNITCOUNT([pit] <> 0) <= 1', message: 'Đơn vị có 2 dòng nhận TNCN' },
    ],
    ...over,
  };
}

export const HEADER = ['         Mã  NV ', '   Họ   ', 'Đơn\nvị', 'Lương thời gian', 'Thưởng', 'Phụ cấp', 'BHXH NV', 'Thuế TNCN', 'Thực chi'];

export function sheetOf(rows: (string | number | null)[][]): RawSheet[] {
  return [{ name: 'Sheet1', rows: [['BẢNG LƯƠNG THÁNG'], [], HEADER, ...rows, [null, 'Tổng cộng', null, 999999999]] }];
}

export function parsed(cfg: FlowConfig, rows: (string | number | null)[][]) {
  const sheets = sheetOf(rows);
  const def = cfg.inputs[0];
  const prop = proposeMapping(sheets, def)!;
  if (prop.missingRequired.length) throw new Error(`unmapped: ${prop.missingRequired.join(',')}`);
  return { SalaryTable: readInput(sheets, def, prop) };
}

export const EMPS: (string | number | null)[][] = [
  ['0022', 'An', 'U1', 10_000_000, 2_000_000, 500_000, 1_050_000, 300_000, 0],
  ['0101', 'Bình', 'U1', 8_000_000, 0, 500_000, 840_000, 100_000, 0],
  ['0200', 'Chi', 'U2', 12_000_000, 3_000_000, null, 1_260_000, 500_000, 0],
];

