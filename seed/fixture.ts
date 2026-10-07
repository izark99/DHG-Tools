// Small invented master set with the same tables and columns as the workbook extract, so the seed
// test runs in CI (the real extract stays local under reference/out/). No company data here.
import type { MasterTable, Scalar } from '../src/engine/types.ts';

const t = (name: string, columns: string[], rows: Scalar[][]): MasterTable => ({ name, columns, rows });

const CC_COLS = ['Unit', 'Cost Center', 'HR', 'AT', 'Opex', 'Dept', 'Dept Old', 'SB/WH', 'Sector', 'Name', 'OI Nhóm', 'Monthly KPI', 'Position', 'Lương 0304'];
// prettier-ignore
const CC: Scalar[][] = [
  ['AC1', 'AC', 'HR9001', 'AT9001', 'AC9000', 'AC', 'AC', 'DHG', 'DHG', 'Phòng A', 'H', false, null, false],
  ['HRD', 'HR', 'HR9001', 'AT9001', 'HR9000', 'HR', 'HR', 'DHG', 'DHG', 'Hội đồng', 'H', false, null, false],
  ['MK1', 'MK', 'HR9002', 'AT9002', 'MK9000', 'MK', 'MK', 'DHG', 'DHG', 'Phòng B', 'M', false, null, false],
  ['X1T', 'X1', 'HR9003', 'AT9003', 'X19000', 'NM', 'NM', 'DHG', 'DHG', 'Tổ sản xuất', 'H', true, null, false],
  ['QA1', 'QA', 'HR9003', 'AT9003', 'QA9000', 'QA', 'QA', 'DHG', 'DHG', 'Phòng C', 'MG', true, null, false],
  ['WH1', 'WH', 'HR9004', 'AT9004', 'WH9000', 'WHA', 'WHA', 'WH', 'KBH', 'Kho', 'H', false, null, true],
  ['CN1', 'IP01', 'HR9005', 'AT9005', 'CNA9000', 'CNA', 'CNA', 'SB', 'KBH', 'Chi nhánh A - Thương mại', 'H', false, 'BH_003', false],
  ['CN2', 'HC01', 'HR9005', 'AT9005', 'CNA9000', 'CNA', 'CNA', 'SB', 'KBH', 'Chi nhánh A - Điều trị', 'H', false, 'BH_004', true],
  ['CN3', 'CNA', 'HR9006', 'AT9006', 'CNA9000', 'CNA', 'CNA', 'SB', 'KBH', 'Chi nhánh A - Văn phòng', 'H', false, null, true],
  ['CN4', 'IP02', 'HR9005', 'AT9005', 'CNB9000', 'CNB', 'CNB', 'SB', 'KBH', 'Chi nhánh B - Thương mại', 'H', false, 'BH_003', false],
  ['CN5', 'HC02', 'HR9005', 'AT9005', 'CNB9000', 'CNB', 'CNB', 'SB', 'KBH', 'Chi nhánh B - Điều trị', 'H', false, 'BH_004', true],
  ['CN6', 'CNB', 'HR9006', 'AT9006', 'CNB9000', 'CNB', 'CNB', 'SB', 'KBH', 'Chi nhánh B - Văn phòng', 'H', false, null, true],
  ['ZZ1', 'ZZ', 'HR9001', 'AT9001', 'ZZ9000', 'ZZ', 'ZZ', 'DHG', 'DHG', 'Đơn vị đã đóng', 'H', false, null, false],
];

const SCHEME_COLS = [
  'Group', 'Thưởng KPI Tháng', 'Thưởng KPI Quý', 'Thưởng KPI 6 tháng', 'Thưởng KPI Năm', 'Thưởng Thu Tiền Tháng', 'Thưởng Thu Tiền Quý',
  'Thưởng Doanh Số Tháng', 'Thưởng Doanh Số Quý', 'Thưởng Doanh Số Năm', 'Thưởng Vượt Quý', 'Thưởng Vượt 6 Tháng', 'Thưởng Khích Lệ Bán Hàng Tháng',
  'Thưởng Khích Lệ Bán Hàng Quý', 'Thưởng Khích Lệ Bán Hàng 6 Tháng', 'Thưởng Khích Lệ Bán Hàng Năm', 'Huấn luyện nội bộ', 'Thưởng Lễ', 'Thưởng Đạt Doanh Thu - Lợi Nhuận',
];
const scheme = (group: string, kpiQ: number, salesQ: number, siQ: number, salesY: Scalar, profit: string): Scalar[] =>
  [group, 0, kpiQ, 0, 0, 0, 1_000_000, 0, salesQ, salesY, 2_000_000, 0, 0, siQ, 0, 0, 3_000_000, '2 * Base Salary', profit];

const BONUS = [
  'Thưởng KPI Quý', 'Thưởng KPI 6 tháng', 'Thưởng KPI Năm', 'Thưởng thu tiền Quý', 'Thưởng doanh số Quý', 'Thưởng doanh số Năm', 'Thưởng vượt quý',
  'Thưởng khích lệ bán hàng quý - Hospital', 'Thưởng khích lệ bán hàng quý - BU2', 'Thưởng khích lệ bán hàng quý - BU3',
  'Thưởng khích lệ bán hàng quý - Modern Trade', 'Thưởng Khích Lệ Bán Hàng 6 Tháng', 'Thưởng khích lệ bán hàng năm', 'Thưởng Hùng Vương', 'Thưởng Lễ',
  'Thưởng Đạt Doanh Thu - Lợi Nhuận', 'Huấn luyện nội bộ',
];

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const nth = ['1st', '2nd', '3rd', '4th'];

export const MINI_MASTERS: Record<string, MasterTable> = Object.fromEntries(
  [
    t('CostCenter', CC_COLS, CC),
    t('UnitGroup', ['Unit Code', 'Group'], [['X1T', 'Direct Production']]),
    t('SalesPosition', ['Tên chức danh', 'Mã chức danh', 'Tính thưởng'], [
      ['NVBH Kênh Hospital (Thầu)', 'BH_004', 'Medical Representative'],
      ['NVBH G Tổng', 'BH_003', 'Sales Representative'],
      ['Tài Xế', 'BH_020', 'Sales Support'],
    ]),
    t('AdditionalSalary', ['Mã NV', 'Additional Salary'], [['0999', 'x']]),
    t('QHY_Group', ['Mã chức danh', 'Kênh', 'Nhóm'], [
      ['BH_003', 'Pharmacy', 'Sales Representative'],
      ['BH_004', 'Hospital', 'Medical Representative'],
      ['SL_012', 'Hospital', 'ASM - Hospital'],
      ['SL_032', 'BU2', 'ASM - Lusefi'],
      ['MK_006', 'MK', 'Brand Manager'],
    ]),
    t('QHY_Scheme', SCHEME_COLS, [
      scheme('Sales Representative', 0, 3_000_000, 0, 0, '0 * Base Salary'),
      scheme('Medical Representative', 0, 3_000_000, 1_500_000, 0, '0 * Base Salary'),
      scheme('ASM - Hospital', 0, 0, 30_000_000, 0, '0 1/6 * Base Salary'),
      scheme('ASM - Lusefi', 0, 0, 30_000_000, 0, '0 * Base Salary'),
      scheme('Brand Manager', 6_000_000, 0, 0, '1.5 * Base Salary', '1.2 * Base Salary'),
      scheme('Production Monthly KPI', 0, 0, 0, 0, '0 * Base Salary'),
      scheme('Normal', 1_000_000, 0, 0, 0, '0 * Base Salary'),
    ]),
    t('QHY_Bonus', ['Bonus', 'Số chia', '% trích', 'Mã chi phí'], BONUS.map((b, i) => [b, [3, 6, 12][i % 3], 1, '0311'])),
    t('TimeLabels', ['Month', 'VN_M', 'VN_Q', 'VN_H', 'EN_M', 'EN_Q', 'EN_H'], months.map((m, i) => {
      const q = Math.floor(i / 3);
      const h = i < 6 ? 0 : 1;
      return [i + 1, `T${String(i + 1).padStart(2, '0')}`, `Q0${q + 1}`, `${h + 1}H`, m, `${nth[q]} Quarter`, `${nth[h]} Half Year`];
    })),
    t('Params', ['key', 'value'], [
      ['BHXH_CTY', 0.175], ['BHYT_CTY', 0.03], ['BHTN_CTY', 0.01], ['KPCD_CTY', 0.02], ['BHXH_NLD', 0.08], ['BHYT_NLD', 0.015], ['BHTN_NLD', 0.01],
      ['LCS', 2_340_000], ['TTV', 4_960_000], ['HUNGKING', 1_000_000],
    ]),
  ].map((m) => [m.name, m]),
);
