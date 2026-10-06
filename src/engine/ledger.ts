// Shared ledger and period-over-period adjustment (PLAN §7).
import { excelRound } from './formula/round';

export interface LedgerKeyFields {
  period: string; // YYYY-MM
  flow: string;
  sector: string;
  dept: string;
  unit: string;
  budgetCode: string;
  costCenter: string;
  costCode: string;
  helper: string;
}

export interface LedgerAccrualRow extends LedgerKeyFields {
  accrual: number;
  adjusted: number;
  actualAccrual: number;
}

export interface LedgerActualRow extends LedgerKeyFields {
  amount: number;
}

export interface LedgerMeta {
  lastPeriod: string;
  flow: string;
  at: string;
  hash: string;
}

export interface Ledger {
  accrual: LedgerAccrualRow[];
  actual: LedgerActualRow[];
  meta: LedgerMeta | null;
}

export const emptyLedger = (): Ledger => ({ accrual: [], actual: [], meta: null });

/** Key = Unit, Budget Code, Cost Center, Cost Code, Helper. */
export function ledgerKey(r: { unit: string; budgetCode: string; costCenter: string; costCode: string; helper: string }): string {
  return [r.unit, r.budgetCode, r.costCenter, r.costCode, r.helper].map((s) => String(s ?? '').trim().toUpperCase()).join('|');
}

export function periodOf(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export interface Balance {
  amount: number;
  /** Latest descriptive fields seen for the key. */
  fields: Omit<LedgerKeyFields, 'period' | 'flow'>;
}

/** Balance per key = Σ actual − Σ actual accrual, over all periods strictly before `period`. */
export function balances(ledger: Ledger, period: string): Map<string, Balance> {
  const out = new Map<string, Balance>();
  const add = (r: LedgerKeyFields, amt: number) => {
    if (r.period >= period) return;
    const k = ledgerKey(r);
    const cur = out.get(k);
    const fields = {
      sector: r.sector,
      dept: r.dept,
      unit: r.unit,
      budgetCode: r.budgetCode,
      costCenter: r.costCenter,
      costCode: r.costCode,
      helper: r.helper,
    };
    if (cur) {
      cur.amount += amt;
      cur.fields = fields;
    } else out.set(k, { amount: amt, fields });
  };
  for (const r of ledger.actual) add(r, r.amount);
  for (const r of ledger.accrual) add(r, -r.actualAccrual);
  for (const b of out.values()) b.amount = excelRound(b.amount, 0);
  return out;
}

export function hasRowsFor(ledger: Ledger, flow: string, period: string): boolean {
  return (
    ledger.accrual.some((r) => r.flow === flow && r.period === period) ||
    ledger.actual.some((r) => r.flow === flow && r.period === period)
  );
}

export function laterPeriods(ledger: Ledger, period: string): string[] {
  const s = new Set<string>();
  for (const r of [...ledger.accrual, ...ledger.actual]) if (r.period > period) s.add(r.period);
  return [...s].sort();
}

const sortRows = <T extends LedgerKeyFields>(rows: T[]): T[] =>
  [...rows].sort((a, b) =>
    a.period !== b.period
      ? a.period < b.period
        ? -1
        : 1
      : a.flow !== b.flow
        ? a.flow < b.flow
          ? -1
          : 1
        : ledgerKey(a) < ledgerKey(b)
          ? -1
          : ledgerKey(a) > ledgerKey(b)
            ? 1
            : 0,
  );

/** Old ledger without this flow+period, plus the new rows. */
export function mergeLedger(
  old: Ledger,
  flow: string,
  period: string,
  accrual: LedgerAccrualRow[],
  actual: LedgerActualRow[],
): Ledger {
  const keep = (r: LedgerKeyFields) => !(r.flow === flow && r.period === period);
  return {
    accrual: sortRows([...old.accrual.filter(keep), ...accrual]),
    actual: sortRows([...old.actual.filter(keep), ...actual]),
    meta: old.meta,
  };
}

/** Canonical text of the data sheets; the hash is taken over this, so re-saving in Excel keeps it stable. */
export function canonicalLedger(l: Ledger): string {
  const keys = (r: LedgerKeyFields) => [r.period, r.flow, r.sector, r.dept, r.unit, r.budgetCode, r.costCenter, r.costCode, r.helper].map((s) => String(s ?? ''));
  const a = l.accrual.map((r) => [...keys(r), r.accrual, r.adjusted, r.actualAccrual].join('\t'));
  const b = l.actual.map((r) => [...keys(r), r.amount].join('\t'));
  return `accrual\n${a.join('\n')}\nactual\n${b.join('\n')}`;
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const ledgerHash = (l: Ledger) => sha256Hex(canonicalLedger(l));
