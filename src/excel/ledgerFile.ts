// Ledger workbook: sheets `accrual`, `actual`, `_meta` (PLAN §7).
import ExcelJS from 'exceljs';
import { normalizeHeader, type Cell } from '../engine/inputs';
import { ledgerHash, type Ledger, type LedgerAccrualRow, type LedgerActualRow, type LedgerKeyFields } from '../engine/ledger';
import { loadWorkbook, sheetsOf } from './read';

const KEY_COLS: [keyof LedgerKeyFields, string][] = [
  ['period', 'Period'],
  ['flow', 'Flow'],
  ['sector', 'Sector'],
  ['dept', 'Dept'],
  ['unit', 'Unit'],
  ['budgetCode', 'Budget Code'],
  ['costCenter', 'Cost Center'],
  ['costCode', 'Cost Code'],
  ['helper', 'Helper'],
];
const ACCRUAL_COLS: [keyof LedgerAccrualRow, string][] = [
  ...KEY_COLS,
  ['accrual', 'Accrual amount this period'],
  ['adjusted', 'Adjusted amount last period'],
  ['actualAccrual', 'Actual accrual amount this period'],
];
const ACTUAL_COLS: [keyof LedgerActualRow, string][] = [...KEY_COLS, ['amount', 'Salary fund']];
const NUMERIC = new Set(['accrual', 'adjusted', 'actualAccrual', 'amount']);

export interface LedgerRead {
  ledger: Ledger;
  /** Hash recomputed from the data sheets. */
  hash: string;
  /** True when the hash in _meta does not match the data (edited outside the app). */
  editedOutside: boolean;
}

function readRows<T>(rows: Cell[][], cols: [string, string][], sheet: string): T[] {
  const header = (rows[0] ?? []).map((c) => normalizeHeader(c));
  const idx = cols.map(([, h]) => header.indexOf(normalizeHeader(h)));
  const missing = cols.filter((_, i) => idx[i] < 0).map(([, h]) => h);
  if (missing.length) throw new Error(`Sheet "${sheet}" của ledger thiếu cột: ${missing.join(', ')}`);
  const out: T[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    if (row.every((c) => c === null || c === undefined || c === '')) continue;
    const rec: Record<string, unknown> = {};
    cols.forEach(([k], i) => {
      const v = row[idx[i]];
      if (NUMERIC.has(k)) {
        const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/,/g, '').trim() || 0);
        if (!Number.isFinite(n)) throw new Error(`Sheet "${sheet}" dòng ${r + 1}: "${String(v)}" không phải số`);
        rec[k] = n;
      } else rec[k] = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString().slice(0, 7) : String(v).trim();
    });
    if (!/^\d{4}-\d{2}$/.test(String(rec.period))) throw new Error(`Sheet "${sheet}" dòng ${r + 1}: Period phải có dạng YYYY-MM`);
    out.push(rec as T);
  }
  return out;
}

export async function readLedger(file: File): Promise<LedgerRead> {
  const sheets = sheetsOf(await loadWorkbook(await file.arrayBuffer()));
  const get = (n: string) => sheets.find((s) => s.name.toLowerCase() === n);
  const acc = get('accrual');
  const act = get('actual');
  if (!acc || !act) throw new Error('File không phải ledger (cần sheet "accrual" và "actual")');
  const ledger: Ledger = {
    accrual: readRows<LedgerAccrualRow>(acc.rows, ACCRUAL_COLS, 'accrual'),
    actual: readRows<LedgerActualRow>(act.rows, ACTUAL_COLS, 'actual'),
    meta: null,
  };
  const meta = get('_meta');
  if (meta) {
    const kv = new Map(meta.rows.map((r) => [String(r?.[0] ?? '').trim(), String(r?.[1] ?? '').trim()]));
    ledger.meta = { lastPeriod: kv.get('last_period') ?? '', flow: kv.get('flow') ?? '', at: kv.get('at') ?? '', hash: kv.get('hash') ?? '' };
  }
  const hash = await ledgerHash(ledger);
  return { ledger, hash, editedOutside: !!ledger.meta?.hash && ledger.meta.hash !== hash };
}

/** Writes the ledger; returns the file and the hash recorded in _meta. */
export async function writeLedger(ledger: Ledger, flow: string, period: string): Promise<{ buffer: ArrayBuffer; hash: string }> {
  const hash = await ledgerHash(ledger);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'C&B Forms';
  const sheet = <T>(name: string, cols: [keyof T, string][], rows: T[]) => {
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = cols.map(([k, h]) => ({
      header: h,
      key: String(k),
      width: NUMERIC.has(String(k)) ? 20 : String(k) === 'helper' ? 16 : 13,
      style: NUMERIC.has(String(k)) ? { numFmt: '#,##0' } : { numFmt: '@' },
    }));
    ws.getRow(1).font = { bold: true };
    for (const r of rows) ws.addRow(Object.fromEntries(cols.map(([k]) => [k, r[k]])));
  };
  sheet('accrual', ACCRUAL_COLS, ledger.accrual);
  sheet('actual', ACTUAL_COLS, ledger.actual);
  const meta = wb.addWorksheet('_meta');
  meta.getColumn(1).width = 14;
  meta.getColumn(2).width = 70;
  meta.addRow(['last_period', period]);
  meta.addRow(['flow', flow]);
  meta.addRow(['at', new Date().toISOString()]);
  meta.addRow(['hash', hash]);
  meta.addRow(['note', 'Không sửa tay sheet accrual / actual. Hash dùng để phát hiện file cũ hoặc bị sửa.']);
  const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  return { buffer, hash };
}
