import { describe, expect, it } from 'vitest';
import { emptyLedger, hasRowsFor, ledgerHash, type Ledger } from './ledger';
import { runFlow } from './run';
import { validateConfig, contextFromMasters } from './validate';
import { config, EMPS, masters, parsed } from '../test/fixture';

describe('input reader', () => {
  it('detects a padded, multi-line header and keeps leading zeros', () => {
    const cfg = config();
    const inp = parsed(cfg, EMPS).SalaryTable;
    expect(inp.headerRow).toBe(2);
    expect(inp.rows.map((r) => r.emp_id)).toEqual(['0022', '0101', '0200']);
    expect(inp.skippedBlankKey).toBe(1);
  });
});

describe('config validation', () => {
  it('fixture config is valid', () => {
    expect(validateConfig(config(), contextFromMasters(masters))).toEqual([]);
  });
  it('catches forward reference and unknown function', () => {
    const cfg = config();
    cfg.employeeTable.columns[2].formula = '[ins] + FOO(1)';
    const errs = validateConfig(cfg, contextFromMasters(masters)).map((e) => e.message);
    expect(errs.some((m) => /đứng sau/.test(m))).toBe(true);
    expect(errs.some((m) => /FOO/.test(m))).toBe(true);
  });
});

describe('hand-computed fixture: 3 employees, 2 units, 4 cost items', () => {
  const cfg = config();
  const r = runFlow({ config: cfg, masters, inputs: parsed(cfg, EMPS), run: { month: 9, year: 2026, preparer: 'X' }, ledger: emptyLedger() });

  it('has no issues', () => {
    // only the informative "skipped total row" warning
    expect(r.issues.map((i) => [i.level, i.source])).toEqual([['warning', 'input']]);
    expect(r.blocked).toBe(false);
  });

  it('Form 02 rows', () => {
    const rows = r.form02!.rows.map((x) => [x.row.unit, x.row.budgetCode, x.row.helper, x.values.accrual, x.values.adj, x.values.actual, x.values.no]);
    expect(rows).toEqual([
      ['U1', 'AT100', '0317Q_ST', 2_000_000, 0, 2_000_000, 1],
      ['U1', 'BUD999', '0319_PC', 1_000_000, 0, 1_000_000, 2],
      ['U1', 'HR100', '0301_LT', 18_000_000, 0, 18_000_000, 3],
      ['U1', 'HR100', '0401_BH', 3_150_000, 0, 3_150_000, 4],
      ['U2', 'AT200', '0317Q_ST', 3_000_000, 0, 3_000_000, 5],
      ['U2', 'HR200', '0301_LT', 12_000_000, 0, 12_000_000, 6],
      ['U2', 'HR200', '0401_BH', 2_100_000, 0, 2_100_000, 7],
    ]);
    expect(r.form02!.rows[0].values.desc).toBe('Trích Thưởng quý_Q03.2026_D1-U1');
    expect(r.form02!.rows[2].values.desc).toBe('Trích Lương thời gian_T09.2026_D1-U1');
    expect(r.form02!.totals.accrual).toBe(41_250_000);
    expect(r.form02!.rows[0].row.sector).toBe('DHG');
    expect(r.form02!.rows[0].row.costCenter).toBe('CC1');
  });

  it('Form 03 rows with unit-level deductions and hidden zero column', () => {
    const rows = r.form03!.rows.map((x) => [x.row.unit, x.row.helper, x.values.gross, x.values.si, x.values.pit, x.values.net]);
    expect(rows).toEqual([
      ['U1', '0319_PC', 1_000_000, 0, 0, 1_000_000],
      ['U1', '0301_LT', 18_000_000, 1_890_000, 400_000, 15_710_000],
      ['U2', '0301_LT', 12_000_000, 1_260_000, 500_000, 10_240_000],
    ]);
    expect(r.form03!.hidden).toEqual(['loan']);
    expect(r.form03!.rows[0].values.desc).toBe('Chi Phụ cấp_T09.2026_D1-U1');
  });

  it('writes ledger rows for this period', () => {
    expect(r.ledgerOut!.accrual).toHaveLength(7);
    expect(r.ledgerOut!.actual).toHaveLength(3);
    expect(r.ledgerOut!.accrual.every((x) => x.period === '2026-09' && x.flow === 'T1')).toBe(true);
  });

  it('employee codes keep leading zeros', () => {
    expect(r.employees.map((e) => e.key)).toEqual(['0022', '0101', '0200']);
    expect(r.employees[0].values.emp_id).toBe('0022');
  });
});

describe('checks', () => {
  it('duplicate employee code and missing unit are errors', () => {
    const cfg = config();
    const rows = [...EMPS, ['0022', 'An 2', 'U1', 1, 0, 0, 0, 0, 0], ['0300', 'Dũng', 'NOPE', 5, 0, 0, 0, 0, 0]];
    const res = runFlow({ config: cfg, masters, inputs: parsed(cfg, rows), run: { month: 9, year: 2026 }, ledger: emptyLedger() });
    // duplicate source rows collapse into one employee; SUMOF adds the basic salary of both rows
    expect(res.employees.find((e) => e.key === '0022')!.values.basic).toBe(10_000_001);
    expect(res.blocked).toBe(true);
    expect(res.issues.some((i) => /không có trong CostCenter/.test(i.message) && i.keys[0].startsWith('0300'))).toBe(true);
  });
  it('total check fails when PIT is not fully allocated', () => {
    const cfg = config();
    cfg.forms.form03.columns[4].formula = 'IF(row.costCode = "0301", UNITSUM(emp.pit), 0) - 1';
    const res = runFlow({ config: cfg, masters, inputs: parsed(cfg, EMPS), run: { month: 9, year: 2026 }, ledger: emptyLedger() });
    expect(res.issues.find((i) => i.source === 'pit_total')?.level).toBe('error');
  });
  it('division by zero is reported as an error, not NaN', () => {
    const cfg = config();
    cfg.employeeTable.columns[5].formula = '[basic] / 0';
    const res = runFlow({ config: cfg, masters, inputs: parsed(cfg, EMPS), run: { month: 9, year: 2026 }, ledger: emptyLedger() });
    expect(res.blocked).toBe(true);
    expect(res.issues[0].message).toMatch(/DIV/);
    expect(res.issues[0].count).toBe(3);
  });
  it('units filtered out by unitFilter are excluded', () => {
    const cfg = config();
    const res = runFlow({
      config: cfg,
      masters,
      inputs: parsed(cfg, [...EMPS, ['0900', 'Z', 'UZ9', 1_000, 0, 0, 0, 0, 0]]),
      run: { month: 9, year: 2026 },
      ledger: emptyLedger(),
    });
    expect(res.form02!.rows.some((x) => x.row.unit === 'UZ9')).toBe(false);
    expect(res.blocked).toBe(false);
  });
});

describe('ledger across 3 periods where payment ≠ accrual', () => {
  // Accrual of 0301 = basic; payment (actual) = UNITSUM(emp.paid)
  const cfg = config();
  cfg.costItems = [cfg.costItems[0]];
  cfg.forms.form03.columns = [
    { id: 'gross', headerVi: 'Tổng', headerEn: 'Gross', formula: 'UNITSUM(emp.paid)', type: 'number' },
  ];
  cfg.checks = [];
  const run = (month: number, rows: (string | number | null)[][], ledger: Ledger) =>
    runFlow({ config: cfg, masters, inputs: parsed(cfg, rows), run: { month, year: 2026 }, ledger });
  const emp = (id: string, unit: string, basic: number, paid: number) => [id, 'x', unit, basic, 0, 0, 0, 0, paid];

  it('produces the expected adjustments', async () => {
    // P1: U1 accrues 100, pays 90; U2 accrues 50, pays 70
    const r1 = run(7, [emp('01', 'U1', 100, 90), emp('02', 'U2', 50, 70)], emptyLedger());
    expect(r1.form02!.rows.map((x) => [x.row.unit, x.values.accrual, x.values.adj, x.values.actual])).toEqual([
      ['U1', 100, 0, 100],
      ['U2', 50, 0, 50],
    ]);
    const l1 = r1.ledgerOut!;
    // P2: U1 accrues 100 (balance 90-100 = -10), pays 120; U2 has no employees (balance 70-50 = +20)
    const r2 = run(8, [emp('01', 'U1', 100, 120)], l1);
    expect(r2.form02!.rows.map((x) => [x.row.unit, x.values.accrual, x.values.adj, x.values.actual])).toEqual([
      ['U1', 100, -10, 90],
      ['U2', 0, 20, 20],
    ]);
    expect(r2.form02!.rows[1].values.desc).toBe('Trích Lương thời gian_T08.2026_D2-U2');
    // P3: U1 balance = (90+120) - (100+90) = 20; U2 balance = 70 - (50+20) = 0 → dropped
    const r3 = run(9, [emp('01', 'U1', 100, 100)], r2.ledgerOut!);
    expect(r3.form02!.rows.map((x) => [x.row.unit, x.values.accrual, x.values.adj, x.values.actual])).toEqual([['U1', 100, 20, 120]]);
    expect(hasRowsFor(r3.ledgerOut!, 'T1', '2026-09')).toBe(true);

    // Re-running P2 against the P3 ledger replaces P2 rows instead of duplicating them,
    // and the adjustment still only looks at earlier periods.
    const r2b = run(8, [emp('01', 'U1', 100, 120)], r3.ledgerOut!);
    expect(r2b.form02!.rows.map((x) => x.values.adj)).toEqual([-10, 20]);
    expect(r2b.ledgerOut!.accrual.filter((x) => x.period === '2026-08')).toHaveLength(2);
    expect(await ledgerHash(r2b.ledgerOut!)).toBe(await ledgerHash(r3.ledgerOut!));
  });

  it('adjusts only cost items this flow accrues', () => {
    const other = config({ id: 'T2' });
    other.costItems = [{ ...other.costItems[0], accrue: false }];
    other.forms.form03.columns = [{ id: 'gross', headerVi: 'Tổng', headerEn: 'Gross', formula: 'UNITSUM(emp.paid)', type: 'number' }];
    other.checks = [];
    const l = run(7, [emp('01', 'U1', 100, 90)], emptyLedger()).ledgerOut!;
    const res = runFlow({ config: other, masters, inputs: parsed(other, [emp('01', 'U1', 100, 90)]), run: { month: 8, year: 2026 }, ledger: l });
    expect(res.form02!.rows).toEqual([]);
  });
});
