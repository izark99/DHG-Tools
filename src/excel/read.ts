// Read an .xlsx into plain 2-D arrays (in the browser; nothing leaves the page).
import ExcelJS from 'exceljs';
import type { Cell, RawSheet } from '../engine/inputs';

function plain(v: ExcelJS.CellValue, numFmt?: string): Cell {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') {
    // keep leading zeros of codes stored as numbers with a "0000" format
    if (numFmt && /^0+$/.test(numFmt) && Number.isInteger(v) && v >= 0) return String(v).padStart(numFmt.length, '0');
    return v;
  }
  if (typeof v === 'string' || typeof v === 'boolean') return v;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('richText' in v && Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('');
    if ('formula' in v || 'sharedFormula' in v) {
      const r = (v as ExcelJS.CellFormulaValue).result;
      if (r === undefined || r === null) return null;
      if (typeof r === 'object' && 'error' in r) return null;
      return plain(r as ExcelJS.CellValue, numFmt);
    }
    if ('text' in v && typeof (v as { text: unknown }).text === 'string') return (v as { text: string }).text;
    if ('error' in v) return null;
  }
  return String(v);
}

export async function loadWorkbook(buf: ArrayBuffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf);
  } catch {
    throw new Error('Không đọc được file. Chỉ hỗ trợ .xlsx / .xlsm (Excel 2007 trở lên).');
  }
  return wb;
}

export function sheetsOf(wb: ExcelJS.Workbook): RawSheet[] {
  const out: RawSheet[] = [];
  wb.eachSheet((ws) => {
    const rows: Cell[][] = [];
    ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const arr: Cell[] = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        arr[col - 1] = plain(cell.value, cell.numFmt);
      });
      rows[rowNumber - 1] = arr;
    });
    for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
    out.push({ name: ws.name, rows });
  });
  return out;
}

export async function readSheets(file: File): Promise<RawSheet[]> {
  return sheetsOf(await loadWorkbook(await file.arrayBuffer()));
}
