// 004 OI — One-off payments (one cost item per run): accrual (Form 02) and payment (Form 03).
import type { FlowConfig } from '../../src/engine/types.ts';
import { accrualLayout, aggregation, col, costItem, f, form02AdjustColumns, keyColumns, paymentLayout, signerParams } from '../common.ts';

// Definitions › CostName (helper, Tên chi phí, EN, Budget Code)
const CATALOGUE: [string, string, string, string][] = [
  ['0301', 'Lương Theo Sản Lượng Sản Xuất', 'Production Volume Based Salary', 'HR0201'],
  ['0319', 'Lương Theo Doanh Số Nhóm Hàng', 'Sales Revenue Based Salary', 'HR'],
  ['0303', 'Lương Thời Gian', 'Paid - Leave Salary', 'HR'],
  ['0304', 'Lương Vị Trí Công Việc', 'Job Position Based Salary', 'HR'],
  ['0305', 'Lương Hỗ Trợ, Ngừng Việc', 'Salary For Work Stoppage', 'HR'],
  ['0306', 'Lương Học, Phong Trào', 'Training / Activity Salary', 'HR'],
  ['0307', 'Lương Bổ Sung', 'People Engagement', 'HR'],
  ['0308', 'Thưởng Doanh Số', 'Hospital Cost', 'HR'],
  ['0309', 'Lương Thêm Giờ', 'Overtime Salary', 'HR'],
  ['0321', 'Phụ Cấp Ca Đêm', 'Nigh Shift Allowance', 'HR'],
  ['0310Y_HB', 'Thưởng Định Kỳ', 'Holiday Bonus', 'HR'],
  ['0310Y_AB', 'Thưởng Đạt Doanh Thu - Lợi Nhuận', 'Bonus For Exceeding The Revenue And Profit Target', 'HR'],
  ['0311M', 'Thưởng KPI Tháng', 'Monthly KPI Bonus', 'HR'],
  ['0311Q', 'Thưởng KPI Quý', 'Quarterly KPI Bonus', 'HR'],
  ['0311H', 'Thưởng KPI 6 tháng', 'Half Yearly KPI Bonus', 'HR'],
  ['0311Y', 'Thưởng KPI Năm', 'Yearly KPI Bonus', 'HR'],
  ['0316', 'Bù Bảo Hiểm', 'Support Insurance', 'HR'],
  ['0317M_TB', 'Lương Thầu', 'Tender Incentive', 'HR'],
  ['0317M_ST', 'Thưởng Đạt Khoán Tháng', 'Monthly Sales Target Incentive', 'HR'],
  ['0317Q_ST', 'Thưởng Đạt Khoán Quý', 'Quarterly Sales Target Incentive', 'HR'],
  ['0317Y_ST', 'Thưởng Đạt Khoán Năm', 'Yearly Sales Target Incentive', 'HR'],
  ['0317Q_GS', 'Thưởng Doanh Số Nhóm Hàng Quý', 'Quarterly Group Sales Target Incentive', 'HR'],
  ['0317M_SI', 'Thưởng Khích Lệ Bán Hàng Tháng', 'Monthly Sales Incentive', 'HR'],
  ['0317Q_SI', 'Thưởng Khích Lệ Bán Hàng Quý', 'Quarterly Sales Incentive', 'HR'],
  ['0317H_SI', 'Thưởng Khích Lệ Bán Hàng 6 Tháng', 'Half Yearly Sales Incentive', 'HR'],
  ['0317Y_SI', 'Thưởng Khích Lệ Bán Hàng Năm', 'Yearly Sales Incentive', 'HR'],
  ['0323M', 'Thưởng Thu Tiền Tháng', 'Monthly Cash Collecting Incentive', 'HR'],
  ['0323Q', 'Thưởng Thu Tiền Quý', 'Quarterly Cash Collecting Incentive', 'HR'],
  ['0322Q', 'Thưởng Vượt Khoán Quý', 'Excess Sales Target Incentive', 'HR'],
  ['0322H', 'Thưởng Vượt Khoán 6 Tháng', 'Excess Sales Target Incentive', 'HR'],
  ['0318', 'Thưởng Hiệu Quả', 'Project Effective Bonus', 'HR0205'],
  ['0401', 'Phụ Cấp Tiền Ăn', 'Meal Allowance', 'AT'],
  ['0404', 'Phụ Cấp Xa Nhà', 'Hardship Allowance', 'HR1000'],
  ['0406', 'Phụ Cấp Hao Mòn Xe', 'Vehicle Amortization Allowance', 'HR1000'],
  ['0417', 'Phụ Cấp Điện Thoại', 'Phone Allowance', 'HR1000'],
  ['1401', 'Hỗ Trợ Tiền Vượt Kilomet', 'Excess Kilomet Allowance', 'DC0400'],
  ['0407Q_HS', 'Hỗ Trợ An Toàn Vệ Sinh Viên', 'Occupational Health & Safety Representatives Allowance', 'HR1000'],
  ['0407Q_FP', 'Hỗ Trợ Phòng Cháy Chữa Cháy', 'Fire Prevention & Fire Fighting Allowance', 'HR1000'],
  ['0407Q_PQ', 'Phụ Cấp Chuyên Môn Dược', 'Pharmacy Qualification Allowance', 'HR1000'],
  ['2002Q', 'Phụ Cấp Chuyên Môn Dược', 'Pharmacy Qualification Allowance', 'Opex'],
  ['2005Q', 'Phụ Cấp Chuyên Môn GTVT', 'Transportation Qualification Allowance', 'WH40100'],
  ['0407M_BD', 'Thù Lao Hội Đồng Quản Trị', 'BOD Remuneration', 'HR1000'],
  ['0407M_SC', 'Thù Lao Hội Đồng Quản Trị', 'BOD Remuneration', 'HR1000'],
  ['0807Q', 'Hỗ trợ Hội Đồng Khoa Học Công Nghệ', 'Science & Technology Council Allowance', 'BM40200'],
  ['0413Y_TB', 'Huấn Luyện Nội Bộ', 'Team Building', 'HR1000'],
  ['0413Y_OS', 'Nghiên Cứu Thị Trường', 'Oversea Travel', 'HR1000'],
  ['0806', 'Khen Thưởng Sáng Kiến', 'Initiative Bonus', 'BM40200'],
  ['0418', 'Tiền, Quà Sinh Nhật Nhân Viên', 'Birthday Money, Gift For Employee', 'HR1000'],
  ['0419', 'Tiền, Quà Tết Nhân Viên', 'Tet Money, Gift For Employee', 'HR1000'],
  ['0416', 'Hỗ Trợ Đi Lại', 'Transportation Allowance', 'HR1000'],
  ['0412', 'Tiền Bảo Hiểm Sức Khoẻ', 'Premium Healthcare Insurance', 'AT'],
  ['0320', 'Thưởng Tạo Động Lực Bán Hàng', 'Motivation Bonus', 'HR'],
  ['0614M_LSF', 'Thưởng Doanh Số Lusefi', 'Sales Bonus for Lusefi', 'LSF0100'],
  ['2903', 'Trợ Cấp Mất Việc Làm', 'Severance Allowance', 'HR1200'],
  ['WF', 'Chi Phí từ Quỹ Phúc Lợi', 'Welfare Fund', 'WF'],
  ['0304M_AS', 'Phụ Cấp Theo Tờ Trình (HNI)', 'Additional Salary (HNI Project)', 'HR'],
  ['0416M_SM', 'Hỗ Trợ Đi Lại (SL&MK Thay đổi nơi làm việc)', 'Transportation Allowance (SL&MK Relocation)', 'HR1000'],
  ['0407M_HA', 'Phụ Cấp Nhà Ở (Theo thư mời nhận việc)', 'Housing Allowance (As Offer Letter)', 'HR1000'],
  ['0407M_W3', 'Phụ Cấp Nhà Ở (Kho 3 Thay đổi nơi làm việc)', 'Housing Allowance (WH3 Relocation)', 'HR1000'],
  ['0407M_SM', 'Phụ Cấp Nhà Ở (SL&MK Thay đổi nơi làm việc)', 'Housing Allowance (SL&MK Relocation)', 'HR1000'],
  ['0308M_TC', 'Thưởng Chốt Hợp Đồng Thầu', 'Tender Contract Bonus', 'HR'],
  ['0614M_BU3', 'Thưởng Hỗ Trợ BU3', 'Support Bonus for BU3', 'BU30200'],
];

/** _vn: the chosen item's Vietnamese name, or the name typed at run time. */
const VN = 'IF(run.name_vn <> "", run.name_vn, ITEM(run.cost, "nameVi"))';
const EN = 'UPPER(IF(run.name_en <> "", run.name_en, ITEM(run.cost, "nameEn")))';
/** _type_vn / _type_en: period label of the chosen item for the title (TimeLabels master). */
const typeLabel = (lang: 'VN' | 'EN') =>
  `UPPER(SWITCH(MID(run.cost, 5, 1), "Y", "", "H", LOOKUP("TimeLabels", run.month, "${lang}_H", ""), "Q", LOOKUP("TimeLabels", run.month, "${lang}_Q", ""), LOOKUP("TimeLabels", run.month, "${lang}_M", "")))`;
const titleVi = (verb: string) =>
  `{=LET(tv, ${typeLabel('VN')}, TEXTJOIN(" ", TRUE, "BẢNG TỔNG HỢP ${verb}", UPPER(${VN}), "–", tv & IF(tv = "", "", ".") & run.year))}`;
const titleEn = (verb: string) => `{=TEXTJOIN(" ", TRUE, "${verb}", ${EN}, "–", ${typeLabel('EN')}, run.year)}`;

// oi_form03.m description: "Chi " & _vn & "_" & Item & "_" & Dept & "-" & Unit, with two exceptions
const PAY_DESC = `"Chi " & PROPER(${VN}) & "_" & row.period & "_" & row.dept & "-" & row.unit & IF(row.helper = "0407M_SC", " (SCIC)", IF(row.unit = "HRD", " (TV HĐQT không điều hành)", ""))`;
const TODAY_DATE = 'TP. Cần Thơ, ngày {=DAY(TODAY())}  tháng {=MONTH(TODAY())} năm {=YEAR(TODAY())}';

export const OI: FlowConfig = {
  schemaVersion: 1,
  id: 'OI',
  name: 'OI — Trích & chi các khoản thu nhập khác',
  ledger: 'shared',
  fileName: 'Form_OI_{cost}_T{MM}.{YYYY}.xlsx',
  inputs: [
    {
      id: 'SalaryTable',
      label: 'Danh sách chi (Salary Table)',
      required: true,
      key: 'emp_id',
      fields: [
        f('emp_id', 'Mã NV', 'text', true),
        f('dv', 'Mã ĐV', 'text'),
        f('unit', 'Mã BP', 'text', true),
        f('name', 'Họ tên', 'text'),
        f('gross', 'Tổng lãnh', 'number', true),
        f('pit', 'Thuế TN'),
        f('other', 'Trừ khác'),
        f('net', 'Thực lãnh'),
      ],
    },
    {
      id: 'SalarySetting',
      label: 'Thiết lập lương (Salary Setting) — cho kiểm tra 0311M / 0311H',
      required: false,
      key: 'emp_id',
      fields: [f('emp_id', 'Mã NV', 'text', true), f('grade', 'Hạng', 'text')],
    },
  ],
  runParams: [
    { id: 'cost', label: 'Khoản chi (chọn khoản)', type: 'costItem', required: true },
    { id: 'name_vn', label: 'Tên khoản (VN) nếu muốn đổi', type: 'text' },
    { id: 'name_en', label: 'Tên khoản (EN) nếu muốn đổi', type: 'text' },
    ...signerParams(true),
  ],
  employeeTable: {
    source: 'SalaryTable',
    rowFilter: null,
    columns: [
      { id: 'emp_id', label: 'Mã NV', formula: 'in.SalaryTable.emp_id', type: 'text' },
      { id: 'dv', label: 'Mã ĐV', formula: 'in.SalaryTable.dv', type: 'text' },
      { id: 'unit', label: 'Mã BP', formula: 'in.SalaryTable.unit', type: 'text' },
      { id: 'name', label: 'Họ và tên', formula: 'in.SalaryTable.name', type: 'text' },
      { id: 'gross', label: 'Tổng lãnh', formula: 'ROUND(SUMOF(in.SalaryTable.gross), 0)', type: 'number' },
      { id: 'pit', label: 'Thuế TN', formula: 'ROUND(SUMOF(in.SalaryTable.pit), 0)', type: 'number' },
      { id: 'other', label: 'Trừ khác', formula: 'ROUND(SUMOF(in.SalaryTable.other), 0)', type: 'number' },
      { id: 'net', label: 'Thực lãnh', formula: 'ROUND(SUMOF(in.SalaryTable.net), 0)', type: 'number' },
      { id: 'sbwh', label: 'SB/WH', formula: 'LOOKUP("CostCenter", [unit], "SB/WH", "")', type: 'text', show: false },
      {
        id: 'helper',
        label: 'Helper',
        // Salary Table[Helper]
        formula: 'IF(AND(run.cost = "0407Q_PQ", IN([sbwh], "SB", "WH")), "2002Q", IF(run.cost = "0407M_BD", IF(RIGHT([emp_id], 2) = "SC", "0407M_SC", "0407M_BD"), run.cost))',
        type: 'text',
      },
      {
        id: 'cc_override',
        label: 'TTCP (ngoại lệ)',
        // oi_form03.m "Added Cost Center"; blank = TTCP of the unit
        formula: 'IFS(IN([helper], "0407M_BD", "0407M_SC"), "BD", [helper] = "0614M_LSF", "LSF", [helper] = "0614M_BU3", "BU3", [helper] = "0318", "BM6", TRUE, "")',
        type: 'text',
      },
      { id: 'grade', label: 'Grade', formula: 'IFERROR(VALUE(LEFT(FIRST(in.SalarySetting.grade), 1)), "Error")', type: 'text', show: false },
    ],
  },
  costItems: [
    // the run's amount: Helper comes from the employee table, everything else from the catalogue entry below
    costItem('RUN', 'Khoản chọn khi chạy', 'HR', 'gross', true, true, { costCode: 'RUN', helperColumn: 'helper', costCenterColumn: 'cc_override' }),
    ...CATALOGUE.map(([h, vi, en, budget]) => costItem(h, vi, budget, '', true, true, { nameEn: en })),
  ],
  aggregation: aggregation(null),
  forms: {
    form02: {
      enabled: true,
      prefix: '',
      rowFilter: null,
      adjust: true,
      ledgerFeed: { sheet: 'accrual', amountColumn: 'accrual' },
      // Form02 query: Form 03 with "Chi" replaced by "Trích"
      columns: form02AdjustColumns(`SUBSTITUTE(${PAY_DESC}, "Chi", "Trích")`).map((c) => (c.id === 'desc' ? { ...c, width: 50 } : c)),
      layout: accrualLayout('Form 02 - Print', titleVi('TRÍCH'), titleEn('ACCRUAL LIST OF'), TODAY_DATE),
    },
    form03: {
      enabled: true,
      prefix: '',
      rowFilter: null,
      adjust: false,
      ledgerFeed: { sheet: 'actual', amountColumn: 'gross' },
      columns: [
        ...keyColumns(PAY_DESC).map((c) => (c.id === 'desc' ? { ...c, width: 50 } : c)),
        col('gross', 'Tổng lãnh', 'Total Gross Amount Received', 'row.amount', 'number', 14.4),
        col('pit', 'Thuế TNCN', 'PIT', 'ROWSUM(emp.pit)', 'number', 12),
        col('other', 'Trừ khác', 'Other Deduction', 'ROWSUM(emp.other)', 'number', 12),
        col('net', 'Thực lãnh', 'Total Net Amount Received', 'ROWSUM(emp.net)', 'number', 14.4),
      ],
      layout: paymentLayout('Form 03 - Print', titleVi('CHI'), titleEn('PAYMENT LIST OF'), TODAY_DATE, { orientation: 'portrait', totalPosition: 'bottom' }),
    },
  },
  checks: [
    { id: 'dup_emp', level: 'error', scope: 'employee', formula: 'COUNTIFS(in.SalaryTable.emp_id, [emp_id]) = 1', message: 'Mã NV xuất hiện nhiều lần trong danh sách (Salary Table!A3)' },
    { id: 'blank_unit', level: 'error', scope: 'employee', formula: 'NOT(ISBLANK([unit]))', message: 'Nhân viên không có Mã BP' },
    {
      id: 'kpi_group',
      level: 'error',
      scope: 'employee',
      // Form 01 Check: 0311M only for units of group M (or MG with grade < 3); 0311H for the others
      formula:
        'LET(g, LOOKUP("CostCenter", [unit], "OI Nhóm", ""), ok, OR(g = "M", AND(g = "MG", IFERROR(VALUE([grade]) < 3, FALSE))), IFS([helper] = "0311M", ok, [helper] = "0311H", NOT(ok), TRUE, TRUE))',
      message: 'Nhân viên không thuộc nhóm được hưởng khoản KPI đã chọn (Form 01 Check)',
    },
    { id: 'form02_total', level: 'error', scope: 'total', formula: 'SUM(f02.accrual) = SUM(emp.gross)', message: 'Tổng Form 02 ≠ tổng Tổng lãnh (Form 02!J1)' },
    { id: 'gross_total', level: 'error', scope: 'total', formula: 'SUM(f03.gross) = SUM(emp.gross)', message: 'Tổng lãnh Form 03 ≠ danh sách (Form 03!J1)' },
    { id: 'pit_total', level: 'error', scope: 'total', formula: 'SUM(f03.pit) = SUM(emp.pit)', message: 'Thuế TNCN Form 03 ≠ danh sách (Form 03!K1)' },
    { id: 'other_total', level: 'error', scope: 'total', formula: 'SUM(f03.other) = SUM(emp.other)', message: 'Trừ khác Form 03 ≠ danh sách (Form 03!L1)' },
    { id: 'net_total', level: 'error', scope: 'total', formula: 'SUM(f03.net) = SUM(in.SalaryTable.net)', message: 'Thực lãnh Form 03 ≠ danh sách (Form 03!M1)' },
  ],
  extraSheets: [],
};
