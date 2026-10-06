// Master table <-> xlsx (row 1 = column names, first column = key).
import ExcelJS from 'exceljs';
import type { MasterTable, Scalar } from '../engine/types';
import { loadWorkbook, sheetsOf } from './read';

export async function tableToXlsx(t: MasterTable): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(t.name.slice(0, 31));
  ws.addRow(t.columns);
  ws.getRow(1).font = { bold: true };
  t.columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = Math.min(40, Math.max(10, c.length + 2));
    // codes such as "0022" must stay text in Excel
    const textCol = t.rows.some((r) => typeof r[i] === 'string');
    if (textCol) ws.getColumn(i + 1).numFmt = '@';
  });
  for (const r of t.rows) ws.addRow(r.map((v) => (v === null ? null : v)));
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

export async function xlsxToTable(file: File, name: string): Promise<MasterTable> {
  const sheets = sheetsOf(await loadWorkbook(await file.arrayBuffer()));
  const sheet = sheets.find((s) => s.name === name) ?? sheets[0];
  if (!sheet) throw new Error('File không có sheet nào');
  const header = (sheet.rows[0] ?? []).map((c) => (c === null || c === undefined ? '' : String(c).trim()));
  let width = header.length;
  while (width > 0 && !header[width - 1]) width--;
  const columns = header.slice(0, width);
  if (!columns.length) throw new Error('Dòng 1 phải là tên cột');
  if (columns.some((c) => !c)) throw new Error('Có cột không có tên ở dòng 1');
  const rows: Scalar[][] = [];
  for (let r = 1; r < sheet.rows.length; r++) {
    const raw = sheet.rows[r] ?? [];
    const row = columns.map((_, i) => {
      const v = raw[i];
      if (v === undefined || v === null || v === '') return null;
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      return v as Scalar;
    });
    if (row.every((v) => v === null)) continue;
    rows.push(row);
  }
  return { name, columns, rows };
}
