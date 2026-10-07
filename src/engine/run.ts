// Runs one flow: employee table → aggregation → forms (+ ledger adjustment) → checks.
// Pure: no DOM, no network.
import { evaluate, keyOf, toBool, toNum, toStr, type Env, type RefMode, type Value } from './formula/evaluator';
import { FormulaError, parse, type Node } from './formula/parser';
import { excelRound } from './formula/round';
import { balances, ledgerKey, mergeLedger, periodOf, type Ledger, type LedgerAccrualRow, type LedgerActualRow, type LedgerSheets } from './ledger';
import type { ParsedInput } from './inputs';
import { formPhase, runModes, type CheckDef, type CostItem, type EmployeeColumn, type ExtraSheetDef, type FlowConfig, type FormDef, type FormLayout, type MasterTable, type PeriodType, type RunMode, type Scalar } from './types';
import { fillTemplate, normKey, periodLabel, runVars } from './util';

export interface RunParams {
  month: number;
  year: number;
  [k: string]: Scalar;
}

export interface RunContext {
  config: FlowConfig;
  masters: Record<string, MasterTable>;
  inputs: Record<string, ParsedInput>;
  run: RunParams;
  /** Ledger read from the uploaded file (or an empty one). Null = flow does not use the ledger. */
  ledger: Ledger | null;
  /** Run stage: accrual forms only, payment forms only, or both (default). */
  mode?: RunMode;
}

const inMode = (config: FlowConfig, id: 'form02' | 'form03', mode: RunMode) => mode === 'both' || formPhase(id, config.forms[id]) === mode;

/** Ledger sheets a run of this mode writes, and whether it needs a ledger at all. */
export function ledgerPlan(config: FlowConfig, mode: RunMode = 'both'): LedgerSheets & { uses: boolean } {
  const out = { accrual: false, actual: false, uses: false };
  for (const id of ['form02', 'form03'] as const) {
    const f = config.forms[id];
    if (!f.enabled || !inMode(config, id, mode)) continue;
    const sheet = f.ledgerFeed?.sheet ?? 'none';
    if (sheet === 'accrual' || sheet === 'both') out.accrual = true;
    if (sheet === 'actual' || sheet === 'both') out.actual = true;
    if (sheet !== 'none' || f.adjust) out.uses = true;
  }
  return out;
}

export interface Issue {
  level: 'error' | 'warning';
  source: string;
  message: string;
  keys: string[];
  count: number;
}

export interface EmpRow {
  key: string;
  values: Record<string, Scalar>;
}

export interface AggRow {
  no: number;
  sector: string;
  dept: string;
  unit: string;
  budgetCode: string;
  costCenter: string;
  costCode: string;
  helper: string;
  name: string;
  nameEn: string;
  periodType: PeriodType;
  period: string;
  description: string;
  amount: number;
  employeeAmount: number;
  count: number;
  adjusted: number;
  actualAccrual: number;
  accrue: boolean;
  pay: boolean;
}

export interface FormRowOut {
  row: AggRow;
  values: Record<string, Scalar>;
}

export interface FormOut {
  id: 'form02' | 'form03';
  def: FormDef;
  /** Layout with every template ({MM}, {param}, {=formula}) already filled in. */
  layout: FormLayout;
  rows: FormRowOut[];
  totals: Record<string, number>;
  hidden: string[];
}

export interface ExtraSheetOut {
  def: ExtraSheetDef;
  values: Scalar[][];
}

export interface RunResult {
  flowId: string;
  period: string;
  run: RunParams;
  employees: EmpRow[];
  aggRows: AggRow[];
  form02: FormOut | null;
  form03: FormOut | null;
  extraSheets: ExtraSheetOut[];
  /** Output file name with templates filled in. */
  fileName: string;
  mode: RunMode;
  issues: Issue[];
  ledgerOut: Ledger | null;
  blocked: boolean;
}

class Issues {
  private map = new Map<string, Issue>();
  add(level: Issue['level'], source: string, message: string, key?: string) {
    const k = `${level}|${source}|${message}`;
    let it = this.map.get(k);
    if (!it) {
      it = { level, source, message, keys: [], count: 0 };
      this.map.set(k, it);
    }
    it.count++;
    if (key !== undefined && it.keys.length < 50) it.keys.push(key);
  }
  list(): Issue[] {
    return [...this.map.values()].sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1));
  }
}

class TableIndex {
  readonly columns: string[];
  private map = new Map<string, Record<string, Scalar>>();
  readonly records: Record<string, Scalar>[];
  constructor(t: MasterTable) {
    this.columns = t.columns;
    this.records = t.rows.map((r) => Object.fromEntries(t.columns.map((c, i) => [c, r[i] ?? null])));
    for (const rec of this.records) {
      const k = normKey(rec[t.columns[0]]);
      if (k && !this.map.has(k)) this.map.set(k, rec);
    }
  }
  get(key: Value): Record<string, Scalar> | undefined {
    return this.map.get(keyOf(key));
  }
}

function numericLike(v: Scalar): Scalar {
  if (typeof v === 'string') {
    const s = v.trim().replace(/,/g, '');
    if (s !== '' && /^-?\d+(\.\d+)?(e-?\d+)?$/i.test(s)) return Number(s);
  }
  return v;
}

const str = (v: Scalar | undefined) => (v === null || v === undefined ? '' : String(v).trim());

export function runFlow(ctx: RunContext): RunResult {
  const { config, run } = ctx;
  const mode: RunMode = runModes(config).includes(ctx.mode ?? 'both') ? (ctx.mode ?? 'both') : 'both';
  const issues = new Issues();
  const period = periodOf(run.year, run.month);
  const nodeCache = new Map<string, Node | FormulaError>();

  const compile = (src: string): Node | FormulaError => {
    let n = nodeCache.get(src);
    if (!n) {
      try {
        n = parse(src);
      } catch (e) {
        n = e instanceof FormulaError ? e : new FormulaError(String(e));
      }
      nodeCache.set(src, n);
    }
    return n;
  };

  // ---- master tables -------------------------------------------------------
  const tables = new Map<string, TableIndex>();
  for (const [name, t] of Object.entries(ctx.masters)) tables.set(name, new TableIndex(t));
  const params = new Map<string, Scalar>();
  const pt = ctx.masters['Params'];
  if (pt) for (const r of pt.rows) if (str(r[0])) params.set(str(r[0]), numericLike(r[1] ?? null));

  const lookup = (table: string, key: Value) => {
    const t = tables.get(table);
    if (!t) throw new FormulaError(`Không có bảng master "${table}"`);
    return t.get(key);
  };
  const baseRef = (ns: string, path: string[]): Value => {
    if (ns === 'P') {
      if (!params.has(path[0])) throw new FormulaError(`Params thiếu key "${path[0]}"`);
      return params.get(path[0]) ?? null;
    }
    if (ns === 'run') return (run[path[0]] as Scalar | undefined) ?? null;
    throw new FormulaError(`Tham chiếu ${ns}.${path.join('.')} không dùng được ở đây`);
  };

  const agg = config.aggregation;
  const ccTable = tables.get(agg.costCenterTable);
  if (!ccTable) issues.add('error', 'config', `Không có bảng master "${agg.costCenterTable}"`);
  const ccRowOf = (unit: Value) => ccTable?.get(unit);
  const ccValue = (unit: Value, col: string): Value => {
    const r = ccRowOf(unit);
    if (!r) throw new FormulaError(`Đơn vị "${toStr(unit)}" không có trong ${agg.costCenterTable}`);
    if (!(col in r)) throw new FormulaError(`${agg.costCenterTable} không có cột "${col}"`);
    return r[col];
  };

  const itemByHelper = new Map(config.costItems.map((c) => [normKey(c.helper), c]));
  const itemField = (helper: string, field: string): Value => {
    const it = itemByHelper.get(normKey(helper));
    if (!it) throw new FormulaError(`Không có cost item "${helper}"`);
    if (!(field in it) && !['nameEn', 'employeeAmount', 'helperColumn', 'costCenterColumn', 'unitFilter'].includes(field))
      throw new FormulaError(`Cost item không có thuộc tính "${field}"`);
    const v = (it as unknown as Record<string, Scalar | undefined>)[field];
    return v === undefined ? null : v;
  };

  // ---- inputs --------------------------------------------------------------
  for (const def of config.inputs) {
    const p = ctx.inputs[def.id];
    if (!p) {
      if (def.required) issues.add('error', 'input', `Thiếu file input "${def.label || def.id}"`);
      continue;
    }
    for (const msg of p.problems) issues.add('warning', 'input', msg);
    if (p.skippedBlankKey) issues.add('warning', 'input', `${def.label || def.id}: bỏ qua ${p.skippedBlankKey} dòng không có mã (dòng tổng / dòng trống)`);
  }
  const inputIndex = new Map<string, Map<string, Record<string, Scalar>[]>>();
  const inputRows = new Map<string, Record<string, Scalar>[]>();
  for (const def of config.inputs) {
    let rows = ctx.inputs[def.id]?.rows ?? [];
    if (def.computed?.length && rows.length) {
      rows = rows.map((r) => ({ ...r }));
      for (const cf of def.computed) {
        const node = compile(cf.formula);
        if (node instanceof FormulaError) {
          issues.add('error', 'formula', `${def.label || def.id} — trường tính [${cf.id}]: ${node.message}`);
          for (const r of rows) r[cf.id] = cf.type === 'number' ? 0 : '';
          continue;
        }
        for (const r of rows) {
          const empKey = normKey(r[def.key]);
          const env: Env = {
            column: () => {
              throw new FormulaError('Trường tính của input không dùng [cột]');
            },
            ref(ns, path, mode) {
              if (ns === 'in') {
                if (path[0] === def.id) {
                  const v = r[path[1]] ?? null;
                  return mode === 'all' ? [v] : v;
                }
                const other = inputIndex.get(path[0]);
                if (!other) throw new FormulaError(`Input "${path[0]}" chưa đọc (đặt input đó lên trước)`);
                const rs = other.get(empKey) ?? [];
                if (mode === 'sum') return rs.reduce((a, x) => a + toNum(x[path[1]] ?? null), 0);
                if (mode === 'all') return rs.map((x) => x[path[1]] ?? null);
                return rs[0]?.[path[1]] ?? null;
              }
              return baseRef(ns, path);
            },
            lookup,
            item: itemField,
          };
          try {
            const v = evaluate(node, env);
            r[cf.id] = cf.type === 'number' ? excelNum(toNum(v)) : toStr(v);
          } catch (e) {
            if (!(e instanceof FormulaError)) throw e;
            issues.add('error', 'formula', `${def.label || def.id} — trường tính [${cf.id}]: ${e.message}`, str(r[def.key]));
            r[cf.id] = cf.type === 'number' ? 0 : '';
          }
        }
      }
    }
    inputRows.set(def.id, rows);
    const m = new Map<string, Record<string, Scalar>[]>();
    for (const r of rows) {
      const k = normKey(r[def.key]);
      const arr = m.get(k);
      if (arr) arr.push(r);
      else m.set(k, [r]);
    }
    inputIndex.set(def.id, m);
  }
  const inputAll = (id: string, field: string): Value => (inputRows.get(id) ?? []).map((r) => r[field] ?? null);

  // ---- employee table ------------------------------------------------------
  const et = config.employeeTable;
  const srcDef = config.inputs.find((i) => i.id === et.source);
  type EmpEnv = Env & { key: string; norm: string; values: Record<string, Scalar> };
  let emps: EmpEnv[] = [];
  const empMemo = new Map<unknown, unknown>();

  const makeEmp = (key: string, norm: string): EmpEnv => {
    const values: Record<string, Scalar> = {};
    const env: EmpEnv = {
      key,
      norm,
      values,
      column(id) {
        if (!(id in values)) throw new FormulaError(`Cột [${id}] chưa được tính`);
        return values[id];
      },
      ref(ns: string, path: string[], mode: RefMode) {
        if (ns === 'emp') return env.column(path[0]);
        if (ns === 'in') {
          const idx = inputIndex.get(path[0]);
          if (!idx) throw new FormulaError(`Không có input "${path[0]}"`);
          const rows = idx.get(norm) ?? [];
          const f = path[1];
          if (mode === 'sum') return rows.reduce((s, r) => s + toNum(r[f] ?? null), 0);
          if (mode === 'all') return rows.map((r) => r[f] ?? null);
          return rows[0]?.[f] ?? null;
        }
        return baseRef(ns, path);
      },
      lookup,
      item: itemField,
      cc: (col) => ccValue(values[agg.unitColumn] ?? null, col),
      scopeRows: () => emps,
      memo: empMemo,
    };
    return env;
  };

  if (srcDef) {
    const seen = new Set<string>();
    for (const r of inputRows.get(srcDef.id) ?? []) {
      const key = str(r[srcDef.key]);
      const norm = normKey(key);
      if (seen.has(norm)) continue;
      seen.add(norm);
      emps.push(makeEmp(key, norm));
    }
  } else issues.add('error', 'config', `Bảng nhân viên: không có input nguồn "${et.source}"`);

  const evalColumnMajor = <E extends Env & { values: Record<string, Scalar> }>(
    rows: E[],
    cols: { id: string; formula: string; type: 'number' | 'text' }[],
    where: string,
    keyOfRow: (r: E) => string,
  ) => {
    for (const c of cols) {
      const node = compile(c.formula);
      for (const r of rows) {
        if (node instanceof FormulaError) {
          r.values[c.id] = c.type === 'number' ? 0 : '';
          continue;
        }
        try {
          const v = evaluate(node, r);
          r.values[c.id] = c.type === 'number' ? excelNum(toNum(v)) : toStr(v);
        } catch (e) {
          if (!(e instanceof FormulaError)) throw e;
          issues.add('error', 'formula', `${where} [${c.id}]: ${e.message}`, keyOfRow(r));
          r.values[c.id] = c.type === 'number' ? 0 : '';
        }
      }
      if (node instanceof FormulaError) issues.add('error', 'formula', `${where} [${c.id}]: ${node.message}`);
    }
  };

  evalColumnMajor(emps, et.columns, 'Bảng nhân viên', (r) => r.key);

  if (et.rowFilter && et.rowFilter.trim()) {
    const node = compile(et.rowFilter);
    if (node instanceof FormulaError) issues.add('error', 'formula', `Bộ lọc bảng nhân viên: ${node.message}`);
    else
      emps = emps.filter((e) => {
        try {
          return toBool(evaluate(node, e));
        } catch (err) {
          if (!(err instanceof FormulaError)) throw err;
          issues.add('error', 'formula', `Bộ lọc bảng nhân viên: ${err.message}`, e.key);
          return true;
        }
      });
  }

  // ---- aggregation -----------------------------------------------------------
  const unitPass = new Map<string, boolean>();
  const unitFilterNode = agg.unitFilter && agg.unitFilter.trim() ? compile(agg.unitFilter) : null;
  if (unitFilterNode instanceof FormulaError) issues.add('error', 'formula', `Bộ lọc đơn vị: ${unitFilterNode.message}`);
  const unitEnv = (unit: string): Env => {
    const r = ccRowOf(unit);
    const fields: Record<string, Scalar> = {
      unit,
      dept: str(r?.[agg.deptColumn]),
      costCenter: str(r?.[agg.costCenterColumn]),
      sector: str(r?.[agg.sectorColumn]),
    };
    return {
      column: () => {
        throw new FormulaError('Không dùng [cột] trong bộ lọc đơn vị');
      },
      ref: (ns, path) => (ns === 'row' ? (fields[path[0]] ?? null) : baseRef(ns, path)),
      lookup,
      item: itemField,
      cc: (col) => ccValue(unit, col),
    };
  };
  const unitIncluded = (unit: string): boolean => {
    const k = normKey(unit);
    let v = unitPass.get(k);
    if (v === undefined) {
      v = true;
      if (unitFilterNode && !(unitFilterNode instanceof FormulaError)) {
        try {
          v = toBool(evaluate(unitFilterNode, unitEnv(unit)));
        } catch (e) {
          if (!(e instanceof FormulaError)) throw e;
          issues.add('error', 'formula', `Bộ lọc đơn vị: ${e.message}`, unit);
        }
      }
      unitPass.set(k, v);
    }
    return v;
  };

  const itemUnit = new Map<string, boolean>();
  const itemAppliesTo = (ci: CostItem, unit: string): boolean => {
    const k = `${normKey(ci.helper)}|${normKey(unit)}`;
    let v = itemUnit.get(k);
    if (v === undefined) {
      v = true;
      const node = compile(ci.unitFilter!);
      if (node instanceof FormulaError) issues.add('error', 'formula', `Cost item ${ci.helper} — bộ lọc đơn vị: ${node.message}`);
      else
        try {
          v = toBool(evaluate(node, unitEnv(unit)));
        } catch (e) {
          if (!(e instanceof FormulaError)) throw e;
          issues.add('error', 'formula', `Cost item ${ci.helper} — bộ lọc đơn vị: ${e.message}`, unit);
        }
      itemUnit.set(k, v);
    }
    return v;
  };
  const empByUnit = new Map<string, EmpEnv[]>();
  const groups = new Map<string, AggRow>();
  const members = new WeakMap<AggRow, EmpEnv[]>();

  for (const e of emps) {
    const unit = str(e.values[agg.unitColumn]);
    const amounts = config.costItems.map((ci) => ({
      ci,
      amount: ci.amount ? toNum(e.values[ci.amount] ?? null) : 0,
      emp: ci.employeeAmount ? toNum(e.values[ci.employeeAmount] ?? null) : 0,
    }));
    const hasMoney = amounts.some((a) => a.amount !== 0 || a.emp !== 0);
    if (!unit) {
      if (hasMoney) issues.add('error', 'aggregation', 'Nhân viên không có đơn vị nhưng có số tiền — số tiền này bị loại khỏi Form', e.key);
      continue;
    }
    const ccRow = ccRowOf(unit);
    if (!ccRow) {
      if (hasMoney && ccTable)
        issues.add('error', 'aggregation', `Đơn vị không có trong ${agg.costCenterTable} — số tiền bị loại khỏi Form`, `${e.key} (${unit})`);
      continue;
    }
    if (!unitIncluded(unit)) continue;
    const un = normKey(unit);
    const list = empByUnit.get(un);
    if (list) list.push(e);
    else empByUnit.set(un, [e]);

    for (const { ci, amount, emp } of amounts) {
      if (amount === 0 && emp === 0) continue;
      if (ci.unitFilter && ci.unitFilter.trim() && !itemAppliesTo(ci, unit)) {
        issues.add('warning', 'aggregation', `Cost item ${ci.helper} không áp dụng cho đơn vị này (bộ lọc đơn vị của cost item) — số tiền bị loại khỏi Form`, `${e.key} (${unit})`);
        continue;
      }
      let item: CostItem = ci;
      let helper = ci.helper;
      if (ci.helperColumn) {
        const h = str(e.values[ci.helperColumn]);
        if (h && normKey(h) !== normKey(ci.helper)) {
          const target = itemByHelper.get(normKey(h));
          if (!target) {
            issues.add('error', 'aggregation', `Helper "${h}" (từ cột ${ci.helperColumn}) không có trong danh sách cost item — số tiền bị loại khỏi Form`, e.key);
            continue;
          }
          helper = target.helper;
          item = target;
        }
      }
      let budget: string;
      if (ccTable && ccTable.columns.includes(item.budget)) {
        budget = str(ccRow[item.budget]);
        if (!budget) issues.add('error', 'aggregation', `Đơn vị thiếu Budget Code ở cột "${item.budget}" của ${agg.costCenterTable}`, unit);
      } else budget = item.budget;
      let costCenter = str(ccRow[agg.costCenterColumn]);
      if (ci.costCenterColumn) {
        const c = str(e.values[ci.costCenterColumn]);
        if (c) costCenter = c;
      }
      const gk = [un, normKey(budget), normKey(costCenter), normKey(helper)].join('|');
      let g = groups.get(gk);
      if (!g) {
        g = {
          no: 0,
          sector: str(ccRow[agg.sectorColumn]),
          dept: str(ccRow[agg.deptColumn]),
          unit: str(ccRow[ccTable!.columns[0]]) || unit,
          budgetCode: budget,
          costCenter,
          costCode: item.costCode,
          helper,
          name: item.nameVi,
          nameEn: item.nameEn ?? '',
          periodType: item.periodType,
          period: periodLabel(item.periodType, run.month, run.year),
          description: '',
          amount: 0,
          employeeAmount: 0,
          count: 0,
          adjusted: 0,
          actualAccrual: 0,
          accrue: item.accrue,
          pay: item.pay,
        };
        groups.set(gk, g);
      }
      g.amount += amount;
      g.employeeAmount += emp;
      g.count++;
      const ms = members.get(g);
      if (ms) ms.push(e);
      else members.set(g, [e]);
    }
  }

  const cmp = (a: string, b: string) => {
    const x = a.toUpperCase();
    const y = b.toUpperCase();
    return x < y ? -1 : x > y ? 1 : 0;
  };
  const sortAgg = (rows: AggRow[]) =>
    rows.sort(
      (a, b) =>
        cmp(a.dept, b.dept) || cmp(a.unit, b.unit) || cmp(a.costCenter, b.costCenter) || cmp(a.budgetCode, b.budgetCode) || cmp(a.helper, b.helper),
    );
  const aggRows = sortAgg(
    [...groups.values()].map((g) => {
      g.amount = excelRound(g.amount, 0);
      g.employeeAmount = excelRound(g.employeeAmount, 0);
      g.actualAccrual = g.amount;
      return g;
    }),
  );

  // ---- forms -----------------------------------------------------------------
  const ledger = ctx.ledger;
  const bal = ledger ? balances(ledger, period) : new Map();
  const ledgerAccrual: LedgerAccrualRow[] = [];
  const ledgerActual: LedgerActualRow[] = [];

  const buildForm = (id: 'form02' | 'form03', def: FormDef): FormOut | null => {
    if (!def.enabled) return null;
    const label = id === 'form02' ? 'Form 02' : 'Form 03';
    let cands: AggRow[] = aggRows
      .filter((r) => (id === 'form02' ? r.accrue : r.pay))
      .map((r) => {
        const copy = { ...r };
        members.set(copy, members.get(r) ?? []);
        return copy;
      });

    if (def.adjust) {
      if (!ledger) issues.add('error', 'ledger', `${label}: cần sổ ledger để tính điều chỉnh`);
      else {
        const accruedHelpers = new Set(config.costItems.filter((c) => c.accrue).map((c) => normKey(c.helper)));
        const present = new Set<string>();
        for (const r of cands) {
          const k = ledgerKey(r);
          present.add(k);
          if (!accruedHelpers.has(normKey(r.helper)) && !r.accrue) continue;
          r.adjusted = bal.get(k)?.amount ?? 0;
          r.actualAccrual = r.amount + r.adjusted;
        }
        for (const [k, b] of bal) {
          if (present.has(k) || b.amount === 0) continue;
          const item = itemByHelper.get(normKey(b.fields.helper));
          if (!item || !item.accrue) continue;
          const ccRow = ccRowOf(b.fields.unit);
          if (ccRow) {
            if (!unitIncluded(b.fields.unit)) continue;
          } else
            issues.add('warning', 'ledger', `Số dư ledger của đơn vị không còn trong ${agg.costCenterTable} vẫn được đưa vào ${label}`, `${b.fields.unit} / ${b.fields.helper}`);
          cands.push({
            no: 0,
            sector: ccRow ? str(ccRow[agg.sectorColumn]) : b.fields.sector,
            dept: ccRow ? str(ccRow[agg.deptColumn]) : b.fields.dept,
            unit: b.fields.unit,
            budgetCode: b.fields.budgetCode,
            costCenter: b.fields.costCenter,
            costCode: b.fields.costCode,
            helper: b.fields.helper,
            name: item.nameVi,
            nameEn: item.nameEn ?? '',
            periodType: item.periodType,
            period: periodLabel(item.periodType, run.month, run.year),
            description: '',
            amount: 0,
            employeeAmount: 0,
            count: 0,
            adjusted: b.amount,
            actualAccrual: b.amount,
            accrue: true,
            pay: item.pay,
          });
        }
        sortAgg(cands);
      }
    }

    for (const r of cands)
      r.description = fillTemplate(agg.descriptionTemplate, {
        prefix: def.prefix,
        name: r.name,
        nameEn: r.nameEn,
        period: r.period,
        dept: r.dept,
        unit: r.unit,
        costCenter: r.costCenter,
        costCode: r.costCode,
        helper: r.helper,
        budgetCode: r.budgetCode,
        sector: r.sector,
      }).trim();

    if (def.rowFilter && def.rowFilter.trim()) {
      const node = compile(def.rowFilter);
      if (node instanceof FormulaError) issues.add('error', 'formula', `${label} bộ lọc dòng: ${node.message}`);
      else
        cands = cands.filter((r) => {
          try {
            return toBool(evaluate(node, rowOnlyEnv(r)));
          } catch (e) {
            if (!(e instanceof FormulaError)) throw e;
            issues.add('error', 'formula', `${label} bộ lọc dòng: ${e.message}`, `${r.unit} / ${r.helper}`);
            return true;
          }
        });
    }
    cands = cands.filter((r) => r.amount !== 0 || r.employeeAmount !== 0 || r.adjusted !== 0);
    cands.forEach((r, i) => (r.no = i + 1));

    type FormEnv = Env & { row: AggRow; values: Record<string, Scalar> };
    const memo = new Map<unknown, unknown>();
    const envs: FormEnv[] = [];
    const byUnit = new Map<string, FormEnv[]>();
    for (const r of cands) {
      const values: Record<string, Scalar> = {};
      const env: FormEnv = {
        row: r,
        values,
        column(cid) {
          if (!(cid in values)) throw new FormulaError(`Cột [${cid}] chưa được tính`);
          return values[cid];
        },
        ref(ns, path) {
          if (ns === 'row') return rowField(r, path[0]);
          return baseRef(ns, path);
        },
        lookup,
        item: itemField,
        cc: (col) => ccValue(r.unit, col),
        unitEmployees: () => empByUnit.get(normKey(r.unit)) ?? [],
        rowEmployees: () => members.get(r) ?? [],
        unitPeers: () => byUnit.get(normKey(r.unit)) ?? [],
        scopeRows: () => envs,
        memo,
      };
      envs.push(env);
      const u = normKey(r.unit);
      const l = byUnit.get(u);
      if (l) l.push(env);
      else byUnit.set(u, [env]);
    }
    evalColumnMajor(envs, def.columns, label, (e) => `${e.row.unit} / ${e.row.helper}`);

    const totals: Record<string, number> = {};
    const hidden: string[] = [];
    for (const c of def.columns) {
      if (c.type !== 'number') continue;
      const t = excelNum(envs.reduce((s, e) => s + toNum(e.values[c.id] ?? null), 0));
      totals[c.id] = t;
      if (c.hideIfZeroTotal && t === 0) hidden.push(c.id);
    }
    for (const c of def.columns) if (c.hidden && !hidden.includes(c.id)) hidden.push(c.id);

    // ledger feed
    const feed = def.ledgerFeed;
    if (feed && feed.sheet !== 'none') {
      for (const e of envs) {
        const base = {
          period,
          flow: config.id,
          sector: e.row.sector,
          dept: e.row.dept,
          unit: e.row.unit,
          budgetCode: e.row.budgetCode,
          costCenter: e.row.costCenter,
          costCode: e.row.costCode,
          helper: e.row.helper,
        };
        const amt = excelRound(toNum(e.values[feed.amountColumn] ?? null), 0);
        if (feed.sheet === 'both') {
          // paid exactly as accrued (actual = accrual): the balance of the key stays 0
          ledgerAccrual.push({ ...base, accrual: amt, adjusted: e.row.adjusted, actualAccrual: amt + e.row.adjusted });
          ledgerActual.push({ ...base, amount: amt + e.row.adjusted });
        } else if (feed.sheet === 'accrual') {
          if (!e.row.accrue) continue;
          ledgerAccrual.push({ ...base, accrual: amt, adjusted: e.row.adjusted, actualAccrual: amt + e.row.adjusted });
        } else ledgerActual.push({ ...base, amount: amt });
      }
    }

    return { id, def, layout: def.layout, rows: envs.map((e) => ({ row: e.row, values: e.values })), totals, hidden };
  };

  const rowField = (r: AggRow, f: string): Scalar => {
    if (!(f in r)) throw new FormulaError(`row.${f}: không có field này`);
    return (r as unknown as Record<string, Scalar>)[f];
  };
  const rowOnlyEnv = (r: AggRow): Env => ({
    column: () => {
      throw new FormulaError('Bộ lọc dòng không dùng được [cột]');
    },
    ref: (ns, path) => (ns === 'row' ? rowField(r, path[0]) : baseRef(ns, path)),
    lookup,
    item: itemField,
    cc: (col) => ccValue(r.unit, col),
  });

  // a run of one stage builds only that stage's forms
  const form02 = inMode(config, 'form02', mode) ? buildForm('form02', config.forms.form02) : null;
  const form03 = inMode(config, 'form03', mode) ? buildForm('form03', config.forms.form03) : null;
  const skipped = (id: 'form02' | 'form03') => config.forms[id].enabled && !inMode(config, id, mode);

  // ---- checks ------------------------------------------------------------------
  const totalEnv: Env = {
    column: () => {
      throw new FormulaError('Phạm vi total không có [cột]');
    },
    ref(ns, path) {
      if (ns === 'emp') return emps.map((e) => e.values[path[0]] ?? null);
      if (ns === 'f02') return (form02?.rows ?? []).map((r) => r.values[path[0]] ?? null);
      if (ns === 'f03') return (form03?.rows ?? []).map((r) => r.values[path[0]] ?? null);
      if (ns === 'in') return inputAll(path[0], path[1]);
      return baseRef(ns, path);
    },
    lookup,
    item: itemField,
  };

  const runCheck = (c: CheckDef) => {
    // a check about a form this run does not produce belongs to the other run
    if ((c.scope === 'form02' && skipped('form02')) || (c.scope === 'form03' && skipped('form03'))) return;
    if ((skipped('form02') && /\bf02\./.test(c.formula)) || (skipped('form03') && /\bf03\./.test(c.formula))) return;
    const node = compile(c.formula);
    if (node instanceof FormulaError) {
      issues.add('error', 'formula', `Kiểm tra "${c.id}": ${node.message}`);
      return;
    }
    const test = (env: Env, key?: string) => {
      try {
        if (!toBool(evaluate(node, env))) issues.add(c.level, c.id, c.message, key);
      } catch (e) {
        if (!(e instanceof FormulaError)) throw e;
        issues.add(c.level, c.id, `${c.message} (lỗi công thức: ${e.message})`, key);
      }
    };
    if (c.scope === 'employee') for (const e of emps) test(e, e.key);
    else if (c.scope === 'total') test(totalEnv);
    else {
      const f = c.scope === 'form02' ? form02 : form03;
      if (!f) return;
      // rebuild light envs over the final values
      const envs: (Env & { values: Record<string, Scalar> })[] = [];
      const byUnit = new Map<string, Env[]>();
      const memo = new Map<unknown, unknown>();
      for (const fr of f.rows) {
        const env: Env & { values: Record<string, Scalar> } = {
          values: fr.values,
          column: (cid) => {
            if (!(cid in fr.values)) throw new FormulaError(`Không có cột [${cid}]`);
            return fr.values[cid];
          },
          ref: (ns, path) => (ns === 'row' ? rowField(fr.row, path[0]) : baseRef(ns, path)),
          lookup,
          item: itemField,
          cc: (col) => ccValue(fr.row.unit, col),
          unitEmployees: () => empByUnit.get(normKey(fr.row.unit)) ?? [],
          rowEmployees: () => members.get(fr.row) ?? [],
          unitPeers: () => byUnit.get(normKey(fr.row.unit)) ?? [],
          scopeRows: () => envs,
          memo,
        };
        envs.push(env);
        const u = normKey(fr.row.unit);
        const l = byUnit.get(u);
        if (l) l.push(env);
        else byUnit.set(u, [env]);
      }
      envs.forEach((env, i) => test(env, `${f.rows[i].row.unit} / ${f.rows[i].row.helper}`));
    }
  };
  for (const c of config.checks) runCheck(c);

  // ---- extra sheets ------------------------------------------------------------
  const extraSheets: ExtraSheetOut[] = (config.extraSheets ?? []).map((def) => ({
    def,
    values: def.rows.map((r, ri) =>
      r.cells.map((cell, ci) => {
        if (!cell || !cell.trim()) return null;
        const node = compile(cell);
        if (node instanceof FormulaError) {
          issues.add('error', 'formula', `Sheet "${def.name}" dòng ${ri + 1} cột ${ci + 1}: ${node.message}`);
          return null;
        }
        try {
          const v = evaluate(node, totalEnv);
          return Array.isArray(v) ? toStr(v) : v;
        } catch (e) {
          if (!(e instanceof FormulaError)) throw e;
          issues.add('error', 'formula', `Sheet "${def.name}" dòng ${ri + 1} cột ${ci + 1}: ${e.message}`);
          return null;
        }
      }),
    ),
  }));

  // ---- templates: {MM}, {param}, {=formula} --------------------------------------
  const vars: Record<string, Scalar> = { ...runVars(run), FLOW: config.id, flow: config.id, flowName: config.name };
  const render = (tpl: string | undefined | null, where: string): string => {
    if (!tpl) return '';
    const withFormulas = tpl.replace(/\{=([^{}]*)\}/g, (_m, expr: string) => {
      const node = compile(expr);
      try {
        if (node instanceof FormulaError) throw node;
        const v = evaluate(node, totalEnv);
        return Array.isArray(v) ? v.map((x) => toStr(x as Scalar)).join(', ') : toStr(v);
      } catch (e) {
        if (!(e instanceof FormulaError)) throw e;
        issues.add('error', 'layout', `${where}: ${e.message}`);
        return '#LỖI';
      }
    });
    return fillTemplate(withFormulas, vars);
  };
  const renderLayout = (L: FormLayout, label: string): FormLayout => ({
    ...L,
    companyName: render(L.companyName, `${label} tên công ty`),
    titleVi: render(L.titleVi, `${label} tiêu đề VI`),
    titleEn: render(L.titleEn, `${label} tiêu đề EN`),
    preLines: (L.preLines ?? []).map((x, i) => render(x, `${label} dòng trước tiêu đề ${i + 1}`)),
    extraLines: (L.extraLines ?? []).map((x, i) => render(x, `${label} dòng sau tiêu đề ${i + 1}`)),
    placeDate: render(L.placeDate, `${label} nơi/ngày ký`),
    signatures: (L.signatures ?? []).map((r) => ({ ...r, title: render(r.title, `${label} chữ ký`), titleEn: render(r.titleEn, `${label} chữ ký`) })),
    footer: (L.footer ?? []).map((b) =>
      b.kind === 'text'
        ? { ...b, lines: b.lines.map((x) => render(x, `${label} footer`)) }
        : { ...b, roles: b.roles.map((r) => ({ ...r, title: render(r.title, `${label} footer`), titleEn: render(r.titleEn, `${label} footer`) })) },
    ),
  });
  if (form02) form02.layout = renderLayout(form02.def.layout, 'Form 02');
  if (form03) form03.layout = renderLayout(form03.def.layout, 'Form 03');
  let fileName = render(config.fileName || 'Form_{FLOW}_T{MM}.{YYYY}.xlsx', 'Tên file');
  // one stage of a two-stage flow: keep the accrual and the payment files apart
  if (mode !== 'both' && runModes(config).length > 1) fileName = fileName.replace(/(\.xlsx)?$/i, `_${mode === 'accrual' ? 'Trich' : 'Chi'}$1`);

  // ---- ledger ------------------------------------------------------------------
  const plan = ledgerPlan(config, mode);
  const ledgerOut = plan.uses ? mergeLedger(ledger ?? { accrual: [], actual: [], meta: null }, config.id, period, ledgerAccrual, ledgerActual, plan) : null;

  const list = issues.list();
  return {
    flowId: config.id,
    period,
    run,
    employees: emps.map((e) => ({ key: e.key, values: e.values })),
    aggRows,
    form02,
    form03,
    extraSheets,
    fileName,
    mode,
    issues: list,
    ledgerOut,
    blocked: list.some((i) => i.level === 'error'),
  };
}

/** Strip floating-point noise (0.1 + 0.2) without changing real decimals. */
function excelNum(n: number): number {
  return Number.isInteger(n) ? n : Number(n.toPrecision(15));
}

export function visibleEmployeeColumns(cols: EmployeeColumn[]): EmployeeColumn[] {
  return cols.filter((c) => c.show !== false);
}
