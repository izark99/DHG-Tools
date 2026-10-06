import type { FlowConfig, FormDef } from '../../engine/types';

const form = (id: 'form02' | 'form03'): FormDef => ({
  enabled: true,
  prefix: id === 'form02' ? 'Trích' : 'Chi',
  rowFilter: null,
  adjust: id === 'form02',
  ledgerFeed: id === 'form02' ? { sheet: 'accrual', amountColumn: 'accrual' } : { sheet: 'actual', amountColumn: 'amount' },
  columns:
    id === 'form02'
      ? [
          { id: 'no', headerVi: 'STT', headerEn: 'No.', formula: 'row.no', type: 'number', total: false },
          { id: 'sector', headerVi: 'Khối', headerEn: 'Sector', formula: 'row.sector', type: 'text' },
          { id: 'dept', headerVi: 'Phòng ban', headerEn: 'Dept', formula: 'row.dept', type: 'text' },
          { id: 'unit', headerVi: 'Đơn vị', headerEn: 'Unit', formula: 'row.unit', type: 'text' },
          { id: 'budget', headerVi: 'Mã ngân sách', headerEn: 'Budget Code', formula: 'row.budgetCode', type: 'text' },
          { id: 'cc', headerVi: 'Trung tâm chi phí', headerEn: 'Cost Center', formula: 'row.costCenter', type: 'text' },
          { id: 'costCode', headerVi: 'Mã chi phí', headerEn: 'Cost Code', formula: 'row.costCode', type: 'text' },
          { id: 'desc', headerVi: 'Diễn giải', headerEn: 'Description', formula: 'row.description', type: 'text' },
          { id: 'accrual', headerVi: 'Số trích kỳ này', headerEn: 'Accrual amount this period', formula: 'row.amount', type: 'number' },
          { id: 'adjusted', headerVi: 'Điều chỉnh kỳ trước', headerEn: 'Adjusted amount last period', formula: 'row.adjusted', type: 'number' },
          { id: 'actual', headerVi: 'Số trích thực tế kỳ này', headerEn: 'Actual accrual amount this period', formula: '[accrual] + [adjusted]', type: 'number' },
        ]
      : [
          { id: 'no', headerVi: 'STT', headerEn: 'No.', formula: 'row.no', type: 'number', total: false },
          { id: 'unit', headerVi: 'Đơn vị', headerEn: 'Unit', formula: 'row.unit', type: 'text' },
          { id: 'budget', headerVi: 'Mã ngân sách', headerEn: 'Budget Code', formula: 'row.budgetCode', type: 'text' },
          { id: 'cc', headerVi: 'Trung tâm chi phí', headerEn: 'Cost Center', formula: 'row.costCenter', type: 'text' },
          { id: 'costCode', headerVi: 'Mã chi phí', headerEn: 'Cost Code', formula: 'row.costCode', type: 'text' },
          { id: 'desc', headerVi: 'Diễn giải', headerEn: 'Description', formula: 'row.description', type: 'text' },
          { id: 'amount', headerVi: 'Tổng thu nhập', headerEn: 'Salary fund', formula: 'row.amount', type: 'number' },
          { id: 'net', headerVi: 'Thực lãnh', headerEn: 'Take-home pay', formula: '[amount]', type: 'number' },
        ],
  layout: {
    sheetName: id === 'form02' ? 'Form 02' : 'Form 03',
    companyName: '',
    titleVi: id === 'form02' ? 'BẢNG TỔNG HỢP TRÍCH LƯƠNG - THÁNG {MM}.{YYYY}' : 'BẢNG TỔNG HỢP CHI LƯƠNG - THÁNG {MM}.{YYYY}',
    titleEn: id === 'form02' ? 'SALARY ACCRUAL SUMMARY - {MM}.{YYYY}' : 'SALARY PAYMENT SUMMARY - {MM}.{YYYY}',
    extraLines: [],
    placeDate: '',
    signatures: [{ title: 'Người lập', titleEn: 'Prepared by' }],
  },
});

/** Starting point for a flow created from scratch in the editor. Contains no business codes. */
export function blankConfig(id: string, name: string): FlowConfig {
  return {
    schemaVersion: 1,
    id,
    name,
    ledger: 'shared',
    fileName: `Form_${id}_T{MM}.{YYYY}.xlsx`,
    inputs: [
      {
        id: 'SalaryTable',
        label: 'Bảng lương',
        required: true,
        key: 'emp_id',
        fields: [
          { id: 'emp_id', label: 'Mã NV', type: 'text', required: true, aliases: ['Mã NV'] },
          { id: 'unit', label: 'Đơn vị', type: 'text', required: true, aliases: ['Đơn vị'] },
        ],
      },
    ],
    runParams: [],
    employeeTable: {
      source: 'SalaryTable',
      rowFilter: null,
      columns: [
        { id: 'emp_id', label: 'Mã NV', formula: 'in.SalaryTable.emp_id', type: 'text' },
        { id: 'unit', label: 'Đơn vị', formula: 'in.SalaryTable.unit', type: 'text' },
      ],
    },
    costItems: [],
    aggregation: {
      unitColumn: 'unit',
      costCenterTable: 'CostCenter',
      deptColumn: 'Dept',
      costCenterColumn: 'Cost Center',
      sectorColumn: 'Sector',
      unitFilter: null,
      descriptionTemplate: '{prefix} {name}_{period}_{dept}-{unit}',
    },
    forms: { form02: form('form02'), form03: form('form03') },
    checks: [
      { id: 'dup_emp', level: 'error', scope: 'employee', formula: 'COUNTSAME([emp_id]) = 1', message: 'Trùng mã nhân viên' },
      { id: 'blank_unit', level: 'error', scope: 'employee', formula: 'NOT(ISBLANK([unit]))', message: 'Nhân viên không có đơn vị' },
    ],
    extraSheets: [],
  };
}
