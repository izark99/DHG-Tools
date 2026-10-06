// 005 QHY — Monthly accrual of quarterly / half-yearly / yearly bonuses (Form 02 only).
import type { EmployeeColumn, FlowConfig } from '../../src/engine/types.ts';
import { accrualLayout, aggregation, costItem, f, form02AdjustColumns, signDateNextMonth, signerParams } from '../common.ts';

const n = (id: string, label: string, formula: string, show = true): EmployeeColumn => ({ id, label, formula, type: 'number', show });

/**
 * Form 01 bonus column: ROUND(% trích × Scheme(Nhóm, bonus) / Số chia, 0).
 * A Scheme cell is an amount or "x * Base Salary" (x may be a mixed fraction such as "0 1/6").
 * % trích and Số chia come from the QHY_Bonus master (the two rows above Form 01 in the workbook).
 */
const bonus = (bonusName: string, schemeColumn = bonusName) =>
  `LET(x, LOOKUP2("QHY_Scheme", [group], "${schemeColumn}"), ROUND(LOOKUP("QHY_Bonus", "${bonusName}", "% trích") * IF(ISNUMBER(VALUE(x)), x, VALUE(TEXTBEFORE(x, " * ")) * [base]) / LOOKUP("QHY_Bonus", "${bonusName}", "Số chia"), 0))`;
/** Sales-incentive columns per channel: only for employees of that channel (Kênh). */
const channelBonus = (channel: string) => `IF([channel] = "${channel}", ${bonus(`Thưởng khích lệ bán hàng quý - ${channel}`, 'Thưởng khích lệ bán hàng quý')}, 0)`;

export const QHY: FlowConfig = {
  schemaVersion: 1,
  id: 'QHY',
  name: 'QHY — Trích thưởng quý, 6 tháng, năm',
  ledger: 'shared',
  fileName: 'Form_QHY_T{MM}.{YYYY}.xlsx',
  inputs: [
    {
      id: 'EmployeeList',
      label: 'Danh sách nhân viên (Employee List)',
      required: true,
      key: 'emp_id',
      fields: [f('emp_id', 'Mã NV', 'text', true), f('ho', 'Họ', 'text'), f('ten', 'Tên', 'text'), f('title_code', 'Mã Chức Danh', 'text'), f('title', 'Chức Danh', 'text')],
    },
    {
      id: 'SalarySetting',
      label: 'Thiết lập lương (Salary Setting)',
      required: true,
      key: 'emp_id',
      fields: [f('emp_id', 'Mã NV', 'text', true), f('unit', 'Mã BP', 'text', true), f('grade', 'Hạng', 'text'), f('coef4d', 'HS.4D'), f('salary4d', 'Lương 4D')],
    },
  ],
  runParams: signerParams(false),
  employeeTable: {
    source: 'EmployeeList',
    rowFilter: null,
    columns: [
      { id: 'emp_id', label: 'Mã NV', formula: 'in.EmployeeList.emp_id', type: 'text' },
      { id: 'unit', label: 'Mã BP', formula: 'in.SalarySetting.unit', type: 'text' },
      { id: 'dv', label: 'Mã ĐV', formula: 'LOOKUP("CostCenter", [unit], "Dept", "")', type: 'text' },
      { id: 'name', label: 'Họ và tên', formula: 'TEXTJOIN(" ", TRUE, in.EmployeeList.ho, in.EmployeeList.ten)', type: 'text' },
      { id: 'title_code', label: 'Mã Chức Danh', formula: 'in.EmployeeList.title_code', type: 'text' },
      { id: 'channel', label: 'Kênh', formula: 'LOOKUP("QHY_Group", [title_code], "Kênh", "")', type: 'text' },
      { id: 'grade', label: 'Ngạch', formula: 'in.SalarySetting.grade', type: 'text' },
      {
        id: 'group',
        label: 'Nhóm',
        formula: 'IFERROR(LOOKUP("QHY_Group", [title_code], "Nhóm"), IF(VALUE(LEFT([grade], 1)) > 2, "Normal", IF(CC("Monthly KPI"), "Production Monthly KPI", "Normal")))',
        type: 'text',
      },
      n('base', 'Lương tháng x hệ số', 'in.SalarySetting.salary4d * IF(in.SalarySetting.coef4d = 0, 1, in.SalarySetting.coef4d)'),
      n('kpi_q', 'Thưởng KPI Quý', bonus('Thưởng KPI Quý')),
      n('kpi_h', 'Thưởng KPI 6 tháng', bonus('Thưởng KPI 6 tháng')),
      n('kpi_y', 'Thưởng KPI Năm', bonus('Thưởng KPI Năm')),
      n('cash_q', 'Thưởng thu tiền Quý', bonus('Thưởng thu tiền Quý')),
      n('sales_q', 'Thưởng doanh số Quý', bonus('Thưởng doanh số Quý')),
      n('sales_y', 'Thưởng doanh số Năm', bonus('Thưởng doanh số Năm')),
      n('excess_q', 'Thưởng vượt quý', bonus('Thưởng vượt quý')),
      n('si_hospital', 'Thưởng khích lệ bán hàng quý - Hospital', channelBonus('Hospital')),
      n('si_bu2', 'Thưởng khích lệ bán hàng quý - BU2', channelBonus('BU2')),
      n('si_bu3', 'Thưởng khích lệ bán hàng quý - BU3', channelBonus('BU3')),
      n('si_mt', 'Thưởng khích lệ bán hàng quý - Modern Trade', channelBonus('Modern Trade')),
      n('si_h', 'Thưởng Khích Lệ Bán Hàng 6 Tháng', bonus('Thưởng Khích Lệ Bán Hàng 6 Tháng')),
      n('si_y', 'Thưởng khích lệ bán hàng năm', bonus('Thưởng khích lệ bán hàng năm')),
      // Hùng Vương bonus stops after April
      n('hung_vuong', 'Thưởng Hùng Vương', 'ROUND(IF(run.month > 4, 0, LOOKUP("QHY_Bonus", "Thưởng Hùng Vương", "% trích") * P.HUNGKING / LOOKUP("QHY_Bonus", "Thưởng Hùng Vương", "Số chia")), 0)'),
      n('holiday', 'Thưởng Lễ', bonus('Thưởng Lễ')),
      n('profit', 'Thưởng Đạt Doanh Thu - Lợi Nhuận', bonus('Thưởng Đạt Doanh Thu - Lợi Nhuận')),
      n('team', 'Huấn luyện nội bộ', bonus('Huấn luyện nội bộ')),
      n('c0311Q', '0311Q', 'ROUND([kpi_q], 0)', false),
      n('c0311H', '0311H', 'ROUND([kpi_h], 0)', false),
      n('c0311Y', '0311Y', 'ROUND([kpi_y], 0)', false),
      n('c0323Q', '0323Q', 'ROUND([cash_q], 0)', false),
      n('c0317Q_ST', '0317Q_ST', 'ROUND([sales_q], 0)', false),
      n('c0317Y_ST', '0317Y_ST', 'ROUND([sales_y], 0)', false),
      n('c0322Q', '0322Q', 'ROUND([excess_q], 0)', false),
      n('c0317Q_SI', '0317Q_SI', 'ROUND([si_hospital] + [si_bu2] + [si_bu3] + [si_mt], 0)', false),
      n('c0317H_SI', '0317H_SI', 'ROUND([si_h], 0)', false),
      n('c0317Y_SI', '0317Y_SI', 'ROUND([si_y], 0)', false),
      n('c0310Y_HB', '0310Y_HB', 'ROUND([holiday] + [hung_vuong], 0)', false),
      n('c0310Y_AB', '0310Y_AB', 'ROUND([profit], 0)', false),
      n('c0413M_TB', '0413M_TB', 'ROUND([team], 0)', false),
    ],
  },
  costItems: [
    costItem('0310Y_HB', 'Trích Thưởng Định Kỳ', 'HR', 'c0310Y_HB', true, false),
    costItem('0310Y_AB', 'Trích Thưởng Đạt Doanh Thu - Lợi Nhuận', 'HR', 'c0310Y_AB', true, false),
    costItem('0311Q', 'Trích Thưởng KPI Quý', 'HR', 'c0311Q', true, false),
    costItem('0311H', 'Trích Thưởng KPI 6 Tháng', 'HR', 'c0311H', true, false),
    costItem('0311Y', 'Trích Thưởng KPI Năm', 'HR', 'c0311Y', true, false),
    costItem('0322Q', 'Trích Thưởng Vượt Quý', 'HR', 'c0322Q', true, false),
    costItem('0323Q', 'Trích Thưởng Thu Tiền Quý', 'HR', 'c0323Q', true, false),
    costItem('0317Q_ST', 'Trích Thưởng Doanh Số Quý', 'HR', 'c0317Q_ST', true, false),
    costItem('0317Y_ST', 'Trích Thưởng Doanh Số Năm', 'HR', 'c0317Y_ST', true, false),
    costItem('0317Q_SI', 'Trích Thưởng Khích Lệ Bán Hàng Quý', 'HR', 'c0317Q_SI', true, false),
    costItem('0317H_SI', 'Trích Thưởng Khích Lệ Bán Hàng 6 Tháng', 'HR', 'c0317H_SI', true, false),
    costItem('0317Y_SI', 'Trích Thưởng Khích Lệ Bán Hàng Năm', 'HR', 'c0317Y_SI', true, false),
    costItem('0413M_TB', 'Trích Chi Phí Huấn Luyện Nội Bộ', 'HR1000', 'c0413M_TB', true, false),
  ],
  aggregation: aggregation('NOT(CONTAINS(row.unit, "Z"))'),
  forms: {
    form02: {
      enabled: true,
      prefix: '',
      rowFilter: null,
      adjust: true,
      ledgerFeed: { sheet: 'accrual', amountColumn: 'accrual' },
      // qhy_accrual.m always labels the description with the month (_m), whatever the bonus period
      columns: form02AdjustColumns('row.name & "_T" & TEXT(run.month, "00") & "." & run.year & "_" & row.dept & "-" & row.unit'),
      layout: accrualLayout(
        'Accrual This Period',
        'BẢNG TỔNG HỢP TRÍCH THƯỞNG QUÝ - 6 THÁNG - NĂM - THÁNG {MM}.{YYYY}',
        'SUMMARY TABLE OF QUARTERLY / HALF-YEARLY / YEARLY BONUS ACCRUAL - {MM}.{YYYY}',
        signDateNextMonth('03'),
      ),
    },
    form03: {
      enabled: false,
      prefix: '',
      rowFilter: null,
      adjust: false,
      ledgerFeed: { sheet: 'none', amountColumn: '' },
      columns: [],
      layout: accrualLayout('Form 03', '', '', ''),
    },
  },
  checks: [
    { id: 'dup_emp', level: 'error', scope: 'employee', formula: 'COUNTIFS(in.EmployeeList.emp_id, [emp_id]) = 1', message: 'Mã NV xuất hiện nhiều lần trong Employee List (Employee List!A1)' },
    { id: 'blank_unit', level: 'error', scope: 'employee', formula: 'NOT(ISBLANK([unit]))', message: 'Nhân viên không có Mã BP trong Salary Setting (Accrual This Period!D2)' },
    { id: 'blank_dept', level: 'error', scope: 'employee', formula: 'NOT(ISBLANK([dv]))', message: 'Mã BP không có trong CostCenter (Accrual This Period!C2)' },
    {
      id: 'position_unit',
      level: 'error',
      scope: 'employee',
      formula: 'IF(IN([title_code], "BH_025", "BH_026"), TRUE, IF(IN([title_code], "BH_003", "BH_004"), LOOKUP("CostCenter", [unit], "Position", "") = [title_code], TRUE))',
      message: 'Chức danh bán hàng không khớp vị trí của đơn vị (Form 01 Check)',
    },
    {
      id: 'form02_total',
      level: 'error',
      scope: 'total',
      formula:
        'SUM(f02.accrual) = SUM(emp.c0311Q, emp.c0311H, emp.c0311Y, emp.c0323Q, emp.c0317Q_ST, emp.c0317Y_ST, emp.c0322Q, emp.c0317Q_SI, emp.c0317H_SI, emp.c0317Y_SI, emp.c0310Y_HB, emp.c0310Y_AB, emp.c0413M_TB)',
      message: 'Tổng trích ≠ tổng các khoản thưởng của bảng nhân viên',
    },
  ],
  extraSheets: [],
};
