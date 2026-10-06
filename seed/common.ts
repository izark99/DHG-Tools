// Shared building blocks of the five starter flows (translated from the C&B workbooks).
// Everything here is SAMPLE CONFIGURATION: the admin edits it in the flow editor.
import type { AggregationDef, CostItem, FooterBlock, FormColumn, FormLayout, InputField, PeriodType, RunParamDef, SignatureRole } from '../src/engine/types.ts';

export const COMPANY = 'CÔNG TY CỔ PHẦN DƯỢC HẬU GIANG';

/** Input field whose header is the same text as in the payroll export. */
export const f = (id: string, header: string, type: InputField['type'] = 'number', required = false, more: string[] = []): InputField => ({
  id,
  label: header.replace(/\s+/g, ' ').trim(),
  type,
  required,
  aliases: [header, ...more],
});

/** Helper "0407M_RE" → cost code "0407", period M; "0303" → period M (workbook rule: 5th char, blank = M). */
export function costItem(helper: string, nameVi: string, budget: string, amount: string, accrue: boolean, pay: boolean, more: Partial<CostItem> = {}): CostItem {
  const t = helper.charAt(4);
  const periodType: PeriodType = t === 'Q' || t === 'H' || t === 'Y' ? t : 'M';
  return { helper, costCode: helper.slice(0, 4), nameVi, nameEn: '', periodType, budget, amount, employeeAmount: null, accrue, pay, ...more };
}

export const aggregation = (unitFilter: string | null): AggregationDef => ({
  unitColumn: 'unit',
  costCenterTable: 'CostCenter',
  deptColumn: 'Dept',
  costCenterColumn: 'Cost Center',
  sectorColumn: 'Sector',
  unitFilter,
  // CostName "Tên chi phí" already starts with "Trích"; Form 03 swaps it for "Chi" in its Description column.
  descriptionTemplate: '{name}_{period}_{dept}-{unit}',
});

const c = (id: string, headerVi: string, headerEn: string, formula: string, type: 'number' | 'text', width?: number, more: Partial<FormColumn> = {}): FormColumn => ({
  id,
  headerVi,
  headerEn,
  formula,
  type,
  ...(width ? { width } : {}),
  ...more,
});

/** STT … Nội Dung: the key columns every print sheet starts with. */
export const keyColumns = (description = 'row.description'): FormColumn[] => [
  c('no', 'STT', 'No', 'row.no', 'number', 4.7, { total: false }),
  c('sector', 'Khối', 'Sector', 'row.sector', 'text', 5.7),
  c('dept', 'Mã đơn vị', 'Dept', 'row.dept', 'text', 6),
  c('unit', 'Mã bộ phận', 'Unit', 'row.unit', 'text', 7),
  c('budget', 'Ngân sách', 'Budget Code', 'row.budgetCode', 'text', 8.5),
  c('cc', 'TTCP', 'Cost Center', 'row.costCenter', 'text', 7),
  c('costCode', 'Mã chi phí', 'Cost Code', 'row.costCode', 'text', 6.5),
  c('desc', 'Nội Dung', 'Description', description, 'text', 30.7),
];

/** Form 02 with the period-over-period adjustment (HQ, SL, OI, QHY). */
export const form02AdjustColumns = (description?: string): FormColumn[] => [
  ...keyColumns(description),
  c('accrual', 'Số tiền trích kỳ này', 'Accrual amount this period', 'row.amount', 'number', 14.3),
  c('adjusted', 'Số điều chỉnh kỳ trước', 'Adjusted amount last period', 'row.adjusted', 'number', 14.3),
  c('actual', 'Số phải trích kỳ này', 'Actual accrual amount this period', '[accrual] + [adjusted]', 'number', 14.3),
];

/** "Chi …" description of Form 03 rows. */
export const PAY_DESCRIPTION = 'SUBSTITUTE(row.description, "Trích", "Chi")';

export const col = c;

// ---- signatures & footer --------------------------------------------------------------------------

export const signerParams = (withDirector: boolean): RunParamDef[] => [
  { id: 'hr_manager', label: 'Trưởng Phòng Nhân sự (tên in)', type: 'text', default: '' },
  { id: 'reporter', label: 'Người đề nghị (tên in)', type: 'text', default: '' },
  ...(withDirector ? [{ id: 'general_director', label: 'Tổng giám đốc (tên in)', type: 'text' as const, default: '' }] : []),
];

const HR: SignatureRole = { title: 'Trưởng Phòng Nhân sự', titleEn: 'Human Resource Manager', nameParam: 'hr_manager' };
const REPORTER: SignatureRole = { title: 'Người đề nghị', titleEn: 'Reporter', nameParam: 'reporter' };
const GD: SignatureRole = { title: 'Tổng giám đốc', titleEn: 'General Director', nameParam: 'general_director' };

/** Accounting review block printed under every accrual form. */
export const ACCOUNTING_REVIEW: FooterBlock[] = [
  {
    kind: 'text',
    align: 'right',
    lines: ['Ý kiến soát xét của phòng kế toán (*)/Phòng Tài chính (*)', 'Review of Accounting Department (*)/ Finance Department (*)'],
  },
  {
    kind: 'text',
    lines: [
      'o  Đồng ý đề nghị trích trước khoản mục STT……',
      '    Agree with the accrual request item No ……',
      'o  Không đồng ý đề nghị trích trước khoản mục STT…… Lý do ……',
      '    Disagree with the accrual request of items No. …… Reason:……',
    ],
  },
  {
    kind: 'signatures',
    roles: [
      { title: 'PHÒNG KẾ TOÁN (*)/ PHÒNG TÀI CHÍNH (*)', titleEn: 'Accounting Department (*)/ Finance Department (*)' },
      { title: 'PHÊ DUYỆT CỦA GIÁM ĐỐC TÀI CHÍNH (**)', titleEn: 'Approval Of Finance Director (**)' },
    ],
  },
];

/** "TP. Cần Thơ, ngày DD tháng <month after the period> năm YYYY" (workbook: EOMONTH(DATE(y,m,1),1)). */
export const signDateNextMonth = (day: string) =>
  `TP. Cần Thơ, ngày ${day} tháng {=TEXT(MONTH(EOMONTH(DATE(run.year, run.month, 1), 1)), "00")} năm {=YEAR(EOMONTH(DATE(run.year, run.month, 1), 1))}`;

/** Accrual print layout: portrait, HR manager + reporter, accounting review. */
export const accrualLayout = (sheetName: string, titleVi: string, titleEn: string, placeDate: string, more: Partial<FormLayout> = {}): FormLayout => ({
  sheetName,
  companyName: COMPANY,
  titleVi,
  titleEn,
  placeDate,
  signatures: [HR, REPORTER],
  footer: ACCOUNTING_REVIEW,
  orientation: 'portrait',
  totalPosition: 'bottom',
  totalLabel: 'Total',
  ...more,
});

/** Payment print layout: landscape, reporter + HR manager + general director, totals above the header. */
export const paymentLayout = (sheetName: string, titleVi: string, titleEn: string, placeDate: string, more: Partial<FormLayout> = {}): FormLayout => ({
  sheetName,
  companyName: COMPANY,
  titleVi,
  titleEn,
  placeDate,
  signatures: [REPORTER, HR, GD],
  orientation: 'landscape',
  totalPosition: 'top',
  totalLabel: 'Total',
  ...more,
});

/** Payroll deduction of a unit placed on the salary rows (workbook: SUMIFS(Form01[x], Form01[Mã BP], Unit) on 0304/…). */
export const unitDeduction = (empColumn: string, costCodes: string[]) =>
  `ROUND(IF(row.costCode IN (${costCodes.map((x) => `"${x}"`).join(', ')}), UNITSUM(emp.${empColumn}), 0), 0)`;
