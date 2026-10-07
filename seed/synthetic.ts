// Synthetic payroll rows for the five starter flows, built from the workbook headers.
// Values are invented but internally consistent, so every workbook check cell holds (net totals,
// salary allocation, bonus totals). The same rows can be pasted into the original workbook.
import type { MasterTable, Scalar } from '../src/engine/types.ts';

export type Rows = Record<string, Scalar>[];
export interface Synthetic {
  run: Record<string, Scalar>;
  inputs: Record<string, Rows>;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

interface Unit {
  unit: string;
  dept: string;
  cc: string;
  sbwh: string;
  flag0304: boolean;
  position: string;
}

function units(masters: Record<string, MasterTable>): Unit[] {
  const t = masters.CostCenter;
  const ix = (c: string) => t.columns.indexOf(c);
  return t.rows.map((r) => ({
    unit: String(r[0] ?? ''),
    dept: String(r[ix('Dept')] ?? ''),
    cc: String(r[ix('Cost Center')] ?? ''),
    sbwh: String(r[ix('SB/WH')] ?? ''),
    flag0304: r[ix('Lương 0304')] === true,
    position: String(r[ix('Position')] ?? ''),
  }));
}

const pick = <T>(xs: T[], n: number, rand: () => number): T[] => {
  const pool = [...xs];
  const out: T[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
};

const k = (rand: () => number, lo: number, hi: number) => Math.round((lo + rand() * (hi - lo)) / 1000) * 1000;
const code = (i: number) => String(900 + i).padStart(4, '0');

export function synthetic(flow: string, masters: Record<string, MasterTable>, month = 9, year = 2026): Synthetic {
  const rand = rng(flow.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
  const all = units(masters).filter((u) => u.unit && u.dept && !u.unit.toUpperCase().includes('Z'));
  const run: Record<string, Scalar> = { month, year, hr_manager: 'Người ký A', reporter: 'Người ký B', general_director: 'Người ký C' };

  if (flow === 'IN') {
    const us = pick(all, 4, rand);
    const rows: Rows = [];
    us.forEach((u, ui) =>
      [0, 1, 2].forEach((j) => {
        const i = ui * 3 + j;
        const basic = k(rand, 5e6, 2e7);
        rows.push({
          emp_id: code(i),
          dv: u.dept,
          unit: u.unit,
          ho: 'Nguyễn',
          ten: `NV${i}`,
          pctn: j === 0 ? 300000 : 0,
          basic,
          position_coef: j === 1 ? 1.027 : 0,
          position_salary: k(rand, 5e6, 2.5e7),
          toxic_salary: j === 2 ? 240000 : null,
          foreign: i === 4 ? 'x' : null,
          kbhxh: i === 5 ? 'Checked' : 'Indeterminate',
          salary_type: i === 7 ? '(4)-10%TNCN từ 5tr_Thử việc-chuyên gia-Nghỉ việc (0 BH-0 gia cảnh)' : i === 8 ? '(2) Thử việc (có BH)' : '(1) Chính thức (có BH-có trừ gia cảnh)',
        });
      }),
    );
    return { run, inputs: { SalaryTable: rows } };
  }

  if (flow === 'HQ') {
    const us = pick(
      all.filter((u) => u.sbwh !== 'SB'),
      4,
      rand,
    );
    const group = masters.UnitGroup?.rows.map((r) => String(r[0])) ?? [];
    const direct = all.find((u) => group.includes(u.unit) && u.sbwh !== 'SB');
    if (direct && !us.includes(direct)) us[0] = direct;
    const rows: Rows = [];
    us.forEach((u, ui) =>
      [0, 1, 2].forEach((j) => {
        const i = ui * 3 + j;
        const r: Record<string, number> = {
          alloc1_raw: k(rand, 6e6, 2.5e7),
          // Direct Production units have no concurrent-role pay column (workbook: Lương kiêm nhiệm only for In-direct)
          concurrent_raw: j === 2 && !group.includes(u.unit) ? 1_000_000 : 0,
          responsibility: j === 0 ? 500_000 : 0,
          female: j === 1 ? 200_000 : 0,
          extra_pay: j === 0 ? 300_000 : 0,
          leave_tg: k(rand, 0, 1e6),
          away: j === 2 ? 700_000 : 0,
          wear: j === 1 ? 333_000 : 0,
          meal: 150_000,
          phone: 300_000,
          travel: j === 0 ? 450_000 : 0,
          house: 0,
          house_wh3: 0,
          work_support: 0,
          house_slmk: 0,
          away_slmk: 0,
          travel_slmk: 0,
          toxic: j === 2 ? 240_000 : 0,
          back_pay: 0,
          business_trip: j === 1 ? 120_000 : 0,
          study: 0,
          support2: 0,
          ins_comp: 0,
          ot: j === 0 ? 410_000 : 0,
          night: j === 1 ? 278_838 : 0,
          leave_nv: 0,
          unit_keep: j === 0 ? 50_000 : 0,
          youth_fee: 10_000,
          union_fee: 61_715,
          party_fee: j === 2 ? 50_000 : 0,
          pit_add: 0,
          welfare_loan: 0,
          union_loan: 0,
          other2: 0,
          unit_fund: 0,
          donation: 20_000,
        };
        r.si = Math.round(r.alloc1_raw * 0.08);
        r.hi = Math.round(r.alloc1_raw * 0.015);
        r.ui = Math.round(r.alloc1_raw * 0.01);
        r.pit = j === 0 ? 350_000 : 0;
        const income =
          r.alloc1_raw + r.concurrent_raw + r.responsibility + r.extra_pay + r.leave_tg + r.away + r.wear + r.phone + r.travel + r.toxic + r.business_trip + r.ot + r.night;
        const deductions = r.si + r.hi + r.ui + r.pit + r.unit_keep + r.youth_fee + r.union_fee + r.party_fee + r.donation;
        r.total_income = income + r.meal + r.female;
        r.net = income + r.meal + r.female - deductions;
        rows.push({ emp_id: code(i), dv: u.dept, unit: u.unit, name: `Nhân viên ${i}`, ...r });
      }),
    );
    return { run: { ...run, group: 'TPT' }, inputs: { SalaryTable: rows } };
  }

  if (flow === 'SL') {
    const sb = all.filter((u) => u.sbwh === 'SB');
    const us = [...pick(sb.filter((u) => u.flag0304), 2, rand), ...pick(sb.filter((u) => !u.flag0304), 2, rand)];
    const hc = sb.find((u) => /^HC\d+$/.test(u.cc));
    if (hc && !us.includes(hc)) us[3] = hc;
    const st: Rows = [];
    const sd: Rows = [];
    us.forEach((u, ui) =>
      [0, 1, 2].forEach((j) => {
        const i = ui * 3 + j;
        const id = code(i);
        const alloc = k(rand, 8e6, 3e7);
        const sales = j === 0 ? 0 : k(rand, 1e8, 9e8);
        const target = j === 2 ? 0 : k(rand, 1e6, 4e6);
        const targetQ = j === 1 ? 3_000_000 : 0;
        const cash = j === 0 ? 0 : k(rand, 5e5, 2e6);
        const title = j === 0 ? 'Tài Xế' : j === 1 ? 'NVBH G Tổng' : 'NVBH Kênh Hospital (Thầu)';
        const r: Record<string, number> = {
          time_salary: k(rand, 0, 9e5),
          alloc,
          concurrent: 0,
          target_tender: target + targetQ,
          kpi_compliance: 0,
          bonus_qy: 0,
          away: 0,
          wear: j === 1 ? 333_000 : 0,
          meal: 2_280_000,
          phone: 300_000,
          travel: j === 1 ? 1_450_000 : 0,
          house: 0,
          house_wh3: 0,
          work_support: 0,
          company_support: 0,
          ins_comp: 0,
          female: j === 2 ? 200_000 : 0,
          extra_pay: j === 0 ? 100_000 : 0,
          regional: 0,
          support70: 0,
          ot: j === 0 ? 250_000 : 0,
          leave_quit: 0,
          tds: j === 1 ? 1_500_000 : 0,
          pit_tds: j === 1 ? 150_000 : 0,
          cash_collect: cash,
          youth_fee: 10_000,
          union_fee: 44_035,
          party_fee: 0,
          unit_keep: j === 0 ? 20_000 : 0,
          meal_receivable: 0,
          unit_fund: 0,
          union_loan: 0,
          welfare_loan: 0,
          other: 0,
          back_tax: 0,
          donation: 0,
          fund24: 0,
          advance_return: 0,
          family_deduction: 15_500_000,
        };
        r.si = Math.round(alloc * 0.08);
        r.hi = Math.round(alloc * 0.015);
        r.ui = Math.round(alloc * 0.01);
        r.ins_total = r.si + r.hi + r.ui;
        r.pit = j === 1 ? 420_000 : 0;
        r.total_income = 0;
        st.push({ emp_id: id, dv: u.dept, unit: u.unit, name: `Nhân viên ${i}`, sales, ...r });
        const d = (salary_type: string, amount: number, period_type = 'Tháng') => sd.push({ period_type, emp_id: id, title, amount, salary_type });
        d('Lương Tháng x Hệ Số (+)', alloc);
        if (target) d('Thưởng Đạt Khoán (+)', target);
        if (targetQ) d('Thưởng Đạt Khoán Quý (+)', targetQ, 'Quý');
        if (cash) d('Lương Thu Tiền (NVBH thu) (+)', cash);
      }),
    );
    return { run, inputs: { SalaryTable: st, SalaryDetail: sd } };
  }

  if (flow === 'OI') {
    const hrd = all.find((u) => u.unit === 'HRD');
    const us = pick(all, 3, rand);
    if (hrd && !us.includes(hrd)) us[0] = hrd;
    const rows: Rows = [];
    us.forEach((u, ui) =>
      [0, 1, 2].forEach((j) => {
        const i = ui * 3 + j;
        const gross = k(rand, 2e6, 3e7);
        const pit = Math.round(gross * 0.1);
        const other = j === 1 ? 50_000 : 0;
        rows.push({ emp_id: j === 2 ? `${code(i)}SC` : code(i), dv: u.dept, unit: u.unit, name: `Thành viên ${i}`, gross, pit, other, net: gross - pit - other });
      }),
    );
    return { run: { ...run, cost: '0407M_BD', name_vn: '', name_en: '' }, inputs: { SalaryTable: rows, SalarySetting: rows.map((r) => ({ emp_id: r.emp_id, grade: '2B.10' })) } };
  }

  if (flow === 'QHY') {
    const titles = ['BH_003', 'BH_004', 'SL_012', 'SL_032', 'MK_006', 'XX_999'];
    const rows: Rows = [];
    const set: Rows = [];
    const byPos = (p: string) => all.find((u) => u.position === p) ?? all[0];
    titles.forEach((t, ti) =>
      [0, 1].forEach((j) => {
        const i = ti * 2 + j;
        const u = t === 'BH_003' || t === 'BH_004' ? byPos(t) : all[(i * 7) % all.length];
        rows.push({ emp_id: code(i), ho: 'Trần', ten: `NV${i}`, title_code: t, title: t });
        set.push({ emp_id: code(i), unit: u.unit, grade: j === 0 ? '2B.10' : '4A.02', coef4d: j === 0 ? 1.027 : 0, salary4d: k(rand, 8e6, 3e7) });
      }),
    );
    return { run, inputs: { EmployeeList: rows, SalarySetting: set } };
  }
  throw new Error(`unknown flow ${flow}`);
}
