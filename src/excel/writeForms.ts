// Form 02 / Form 03 print layout (PLAN §8). Values only in data cells; the Total row uses SUM.
import ExcelJS from 'exceljs';
import type { FormOut, RunResult } from '../engine/run';
import type { FlowConfig, FormColumn, Scalar } from '../engine/types';
import { fillTemplate, runVars } from '../engine/util';

const thin: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};
const NUM = '#,##0';

export function colWidth(c: FormColumn): number {
  if (c.width) return c.width;
  if (c.type === 'number') return c.id === 'no' ? 6 : 16;
  return /desc|diễn giải/i.test(c.id + c.headerVi) ? 48 : 13;
}

function addFormSheet(wb: ExcelJS.Workbook, form: FormOut, vars: Record<string, Scalar>, testMode: boolean) {
  const def = form.def;
  const L = form.layout ?? def.layout;
  const ws = wb.addWorksheet((L.sheetName || form.id).slice(0, 31), {
    pageSetup: {
      orientation: L.orientation ?? 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  });
  const cols = def.columns;
  const n = cols.length;
  cols.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = colWidth(c);
    if (form.hidden.includes(c.id)) col.hidden = true;
  });
  const visibleIdx = cols.map((c, i) => (form.hidden.includes(c.id) ? -1 : i + 1)).filter((i) => i > 0);
  const firstVis = visibleIdx[0] ?? 1;
  const lastVis = visibleIdx[visibleIdx.length - 1] ?? n;
  const fill = (t: string | undefined) => fillTemplate(t ?? '', vars).trim();

  let r = 1;
  const line = (text: string, font: Partial<ExcelJS.Font>, align: ExcelJS.Alignment['horizontal'] = 'center') => {
    ws.mergeCells(r, 1, r, Math.max(n, 1));
    const cell = ws.getCell(r, 1);
    cell.value = text;
    cell.font = font;
    cell.alignment = { horizontal: align, vertical: 'middle', wrapText: false };
    r++;
  };
  if (L.companyName) {
    ws.getCell(r, 1).value = fill(L.companyName);
    ws.getCell(r, 1).font = { bold: true };
    r++;
  }
  for (const pre of L.preLines ?? []) {
    const t = fill(pre);
    if (t) line(t, { bold: true }, 'left');
  }
  if (testMode) line('BẢN CHẠY THỬ (TEST) — KHÔNG GỬI KẾ TOÁN', { bold: true, color: { argb: 'FFC00000' } });
  line(fill(L.titleVi), { bold: true, size: 14 });
  if (L.titleEn) line(fill(L.titleEn), { italic: true, size: 12 });
  for (const extra of L.extraLines ?? []) {
    const t = fill(extra);
    if (t) line(t, { bold: true }, 'left');
  }
  const totalTop = L.totalPosition === 'top';
  const totalRowTop = totalTop ? r : -1;
  r++; // the total row (top) or a blank row

  const hdrVi = r;
  const hdrEn = r + 1;
  cols.forEach((c, i) => {
    const a = ws.getCell(hdrVi, i + 1);
    a.value = c.headerVi;
    a.font = { bold: true };
    a.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    a.border = thin;
    a.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7EEF7' } };
    const b = ws.getCell(hdrEn, i + 1);
    b.value = c.headerEn;
    b.font = { italic: true };
    b.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    b.border = thin;
    b.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7EEF7' } };
  });
  ws.getRow(hdrVi).height = 32;
  ws.getRow(hdrEn).height = 30;
  ws.pageSetup.printTitlesRow = `${hdrVi}:${hdrEn}`;
  r = hdrEn + 1;

  const firstData = r;
  for (const fr of form.rows) {
    cols.forEach((c, i) => {
      const cell = ws.getCell(r, i + 1);
      const v = fr.values[c.id];
      cell.value = v === null || v === undefined ? null : c.type === 'number' ? Number(v) : String(v);
      cell.border = thin;
      if (c.type === 'number') cell.numFmt = NUM;
      else cell.alignment = { wrapText: /desc/i.test(c.id), vertical: 'middle' };
    });
    r++;
  }
  const lastData = r - 1;

  // Total row (SUM formulas so Accounting can re-check)
  const totalRow = totalTop ? totalRowTop : r;
  const labelCol = cols.findIndex((c) => c.type === 'text') + 1 || 1;
  cols.forEach((c, i) => {
    const cell = ws.getCell(totalRow, i + 1);
    cell.border = thin;
    cell.font = { bold: true };
    if (c.type === 'number' && c.total !== false) {
      const L1 = ws.getColumn(i + 1).letter;
      cell.value = form.rows.length ? { formula: `SUM(${L1}${firstData}:${L1}${lastData})`, result: form.totals[c.id] ?? 0 } : 0;
      cell.numFmt = NUM;
    }
  });
  ws.getCell(totalRow, labelCol).value = L.totalLabel || 'Tổng cộng / Total';
  r = (totalTop ? lastData : totalRow) + 2;

  // Signature rows and footer blocks
  const span = (roles: number, k: number) => {
    const per = visibleIdx.length / roles;
    const from = visibleIdx[Math.floor(k * per)] ?? firstVis;
    const to = visibleIdx[Math.max(Math.floor((k + 1) * per) - 1, Math.floor(k * per))] ?? from;
    return [from, to] as const;
  };
  const put = (row: number, from: number, to: number, text: string, font: Partial<ExcelJS.Font>, align: ExcelJS.Alignment['horizontal'] = 'center') => {
    if (to > from) ws.mergeCells(row, from, row, to);
    const c = ws.getCell(row, from);
    c.value = text;
    c.font = font;
    c.alignment = { horizontal: align, wrapText: false };
  };
  const signatureRow = (roles: FormOut['layout']['signatures']) => {
    if (!roles.length) return;
    roles.forEach((role, k) => {
      const [from, to] = span(roles.length, k);
      put(r, from, to, fill(role.title), { bold: true });
      if (role.titleEn) put(r + 1, from, to, fill(role.titleEn), { italic: true });
      const name = role.nameParam ? vars[role.nameParam] : role.name;
      if (name) put(r + 5, from, to, String(name), { bold: true });
    });
    r += 7;
  };
  if (L.placeDate) {
    const t = fill(L.placeDate);
    if (t) {
      const roles = L.signatures ?? [];
      const [from, to] = roles.length ? span(roles.length, roles.length - 1) : [firstVis, lastVis];
      put(r, from, to, t, { italic: true });
      r++;
    }
  }
  signatureRow(L.signatures ?? []);
  for (const b of L.footer ?? []) {
    if (b.kind === 'signatures') signatureRow(b.roles);
    else {
      for (const t of b.lines) {
        const text = fill(t);
        if (text) {
          if (b.align === 'right') {
            const [from, to] = span(2, 1);
            put(r, from, to, text, { italic: true });
          } else put(r, firstVis, lastVis, text, {}, 'left');
        }
        r++;
      }
      r++;
    }
  }
}

function addExtraSheet(wb: ExcelJS.Workbook, sheet: RunResult['extraSheets'][number], vars: Record<string, Scalar>) {
  const ws = wb.addWorksheet(sheet.def.name, { pageSetup: { orientation: 'portrait', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  let r = 1;
  if (sheet.def.title) {
    ws.mergeCells(r, 1, r, Math.max(sheet.def.columns.length, 1));
    ws.getCell(r, 1).value = fillTemplate(sheet.def.title, vars);
    ws.getCell(r, 1).font = { bold: true, size: 13 };
    ws.getCell(r, 1).alignment = { horizontal: 'center' };
    r += 2;
  }
  sheet.def.columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width ?? (c.type === 'number' ? 18 : 24);
    const cell = ws.getCell(r, i + 1);
    cell.value = c.header;
    cell.font = { bold: true };
    cell.border = thin;
    cell.alignment = { horizontal: 'center', wrapText: true };
  });
  r++;
  for (const row of sheet.values) {
    row.forEach((v, i) => {
      const cell = ws.getCell(r, i + 1);
      cell.value = v;
      cell.border = thin;
      if (typeof v === 'number') cell.numFmt = sheet.def.columns[i]?.type === 'text' ? 'General' : Number.isInteger(v) ? NUM : '#,##0.00##';
    });
    r++;
  }
}

export function outputVars(config: FlowConfig, result: RunResult): Record<string, Scalar> {
  return { ...runVars(result.run), FLOW: config.id, flow: config.id, flowName: config.name };
}

export async function writeForms(config: FlowConfig, result: RunResult, testMode = false): Promise<{ buffer: ArrayBuffer; fileName: string }> {
  const vars = outputVars(config, result);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'C&B Forms';
  if (result.form02) addFormSheet(wb, result.form02, vars, testMode);
  if (result.form03) addFormSheet(wb, result.form03, vars, testMode);
  for (const s of result.extraSheets) addExtraSheet(wb, s, vars);
  if (!wb.worksheets.length) wb.addWorksheet('Empty');
  const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  let fileName = (result.fileName || fillTemplate(config.fileName || 'Form_{FLOW}_T{MM}.{YYYY}.xlsx', vars)).replace(/[\\/:*?"<>|]+/g, '_');
  if (!/\.xlsx$/i.test(fileName)) fileName += '.xlsx';
  if (testMode) fileName = fileName.replace(/\.xlsx$/i, '_TEST.xlsx');
  return { buffer, fileName };
}

export function ledgerFileName(flow: string, period: string, testMode = false): string {
  return `Ledger_${period}_sau-${flow}${testMode ? '_TEST' : ''}.xlsx`;
}
