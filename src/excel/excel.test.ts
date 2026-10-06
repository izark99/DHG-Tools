import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { emptyLedger } from '../engine/ledger';
import { runFlow } from '../engine/run';
import { config, EMPS, masters, parsed } from '../test/fixture';
import { readLedger, writeLedger } from './ledgerFile';
import { sheetsOf } from './read';
import { writeForms } from './writeForms';

const cfg = config();
const result = runFlow({ config: cfg, masters, inputs: parsed(cfg, EMPS), run: { month: 9, year: 2026, preparer: 'Nguyễn Văn A' }, ledger: emptyLedger() });

describe('Form workbook', () => {
  it('writes both forms with titles, two header rows, values, SUM total and hidden zero columns', async () => {
    const { buffer, fileName } = await writeForms(cfg, result);
    expect(fileName).toBe('Form_T1_T09.2026.xlsx');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Form 02', 'Form 03']);

    const f2 = wb.getWorksheet('Form 02')!;
    expect(f2.getCell('A2').value).toBe('BẢNG TEST - THÁNG 09.2026');
    expect(f2.getCell('A3').value).toBe('TEST - 09.2026');
    // header rows 5 (VI) and 6 (EN), data from row 7
    expect(f2.getCell(5, 3).value).toBe('Trích kỳ này');
    expect(f2.getCell(6, 3).value).toBe('Accrual');
    expect(f2.getCell(7, 2).value).toBe('Trích Thưởng quý_Q03.2026_D1-U1');
    expect(f2.getCell(7, 3).value).toBe(2_000_000);
    const total = f2.getCell(14, 3).value as ExcelJS.CellFormulaValue;
    expect(total.formula).toBe('SUM(C7:C13)');
    expect(total.result).toBe(41_250_000);
    expect(f2.pageSetup.orientation).toBe('landscape');
    expect(f2.pageSetup.fitToWidth).toBe(1);
    expect(f2.pageSetup.printTitlesRow).toBe('5:6');

    const f3 = wb.getWorksheet('Form 03')!;
    const loanCol = cfg.forms.form03.columns.findIndex((c) => c.id === 'loan') + 1;
    expect(f3.getColumn(loanCol).hidden).toBe(true);
    expect(f3.getColumn(loanCol - 1).hidden).toBe(false);
    // signer name from run parameter
    let found = false;
    f3.eachRow((row) => row.eachCell((c) => (found ||= c.value === 'Nguyễn Văn A')));
    expect(found).toBe(true);
  });
});

describe('Ledger workbook', () => {
  it('round-trips with a stable hash and detects edits', async () => {
    const ledger = result.ledgerOut!;
    const { buffer, hash } = await writeLedger(ledger, 'T1', '2026-09');
    const file = new File([buffer], 'ledger.xlsx');
    const back = await readLedger(file);
    expect(back.hash).toBe(hash);
    expect(back.editedOutside).toBe(false);
    expect(back.ledger.accrual).toEqual(ledger.accrual);
    expect(back.ledger.actual).toEqual(ledger.actual);
    expect(back.ledger.meta?.lastPeriod).toBe('2026-09');

    // edit one amount outside the app
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    wb.getWorksheet('accrual')!.getCell(2, 10).value = 1;
    const edited = await readLedger(new File([(await wb.xlsx.writeBuffer()) as ArrayBuffer], 'l.xlsx'));
    expect(edited.editedOutside).toBe(true);
  });

  it('reads input sheets with leading-zero codes stored as numbers', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('S');
    ws.addRow(['Mã NV', 'Lương']);
    ws.addRow([22, 100]);
    ws.getCell('A2').numFmt = '0000';
    const loaded = new ExcelJS.Workbook();
    await loaded.xlsx.load((await wb.xlsx.writeBuffer()) as ArrayBuffer);
    expect(sheetsOf(loaded)[0].rows[1][0]).toBe('0022');
  });
});

describe('Master table xlsx', () => {
  it('round-trips ~400 rows with text codes, numbers, blanks and booleans without loss', async () => {
    const { tableToXlsx, xlsxToTable } = await import('./masterFile');
    const rows = Array.from({ length: 400 }, (_, i) => [
      `U${String(i).padStart(4, '0')}`,
      `00${i}`,
      i % 3 === 0 ? null : `Phòng ${i}`,
      i * 1.5,
      i % 2 === 0,
    ]);
    const t = { name: 'CostCenter', columns: ['Unit', 'Code', 'Tên', 'Rate', 'Flag'], rows };
    const back = await xlsxToTable(new File([await tableToXlsx(t)], 'CostCenter.xlsx'), 'CostCenter');
    expect(back).toEqual(t);
  });
});
