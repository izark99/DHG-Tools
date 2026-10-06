// Input reader: header auto-detection and alias mapping (PLAN §5.1).
// Works on plain 2-D arrays so it has no Excel dependency.
import type { InputDef, InputField, Scalar } from './types';

export type Cell = string | number | boolean | Date | null | undefined;

export interface RawSheet {
  name: string;
  rows: Cell[][];
}

export interface ParsedInput {
  inputId: string;
  sheet: string;
  headerRow: number; // 0-based
  headers: string[];
  /** field id → column index */
  mapping: Record<string, number>;
  rows: Record<string, Scalar>[];
  /** Messages about cells that could not be read as the field type. */
  problems: string[];
  /** Rows skipped because the key was blank. */
  skippedBlankKey: number;
}

export interface MappingProposal {
  sheet: string;
  headerRow: number;
  headers: string[];
  mapping: Record<string, number>;
  /** Required fields that matched no header. */
  missingRequired: string[];
  /** Optional fields that matched no header. */
  missingOptional: string[];
}

export function normalizeHeader(s: unknown): string {
  if (s === null || s === undefined) return '';
  return String(s).normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
}

function fieldNames(f: InputField): string[] {
  return [...f.aliases, ...(f.label ? [f.label] : []), f.id].map(normalizeHeader).filter(Boolean);
}

function matchRow(row: Cell[], def: InputDef): { score: number; mapping: Record<string, number> } {
  const headers = row.map((c) => normalizeHeader(cellText(c)));
  const mapping: Record<string, number> = {};
  const used = new Set<number>();
  for (const f of def.fields) {
    const names = fieldNames(f);
    for (const name of names) {
      const idx = headers.findIndex((h, i) => h === name && !used.has(i));
      if (idx >= 0) {
        mapping[f.id] = idx;
        used.add(idx);
        break;
      }
    }
  }
  return { score: Object.keys(mapping).length, mapping };
}

/** Pick the sheet and header row (top 20 rows) that match the most aliases. */
export function proposeMapping(sheets: RawSheet[], def: InputDef): MappingProposal | null {
  let best: { sheet: RawSheet; row: number; score: number; mapping: Record<string, number> } | null = null;
  const ordered = def.sheet ? [...sheets].sort((a, b) => Number(b.name === def.sheet) - Number(a.name === def.sheet)) : sheets;
  for (const sheet of ordered) {
    const limit = Math.min(20, sheet.rows.length);
    for (let r = 0; r < limit; r++) {
      const m = matchRow(sheet.rows[r] ?? [], def);
      if (m.score > 0 && (!best || m.score > best.score)) best = { sheet, row: r, ...m };
    }
  }
  if (!best) {
    const sheet = ordered[0];
    if (!sheet) return null;
    return {
      sheet: sheet.name,
      headerRow: 0,
      headers: (sheet.rows[0] ?? []).map((c) => cellText(c)),
      mapping: {},
      missingRequired: def.fields.filter((f) => f.required).map((f) => f.id),
      missingOptional: def.fields.filter((f) => !f.required).map((f) => f.id),
    };
  }
  const headers = (best.sheet.rows[best.row] ?? []).map((c) => cellText(c));
  return {
    sheet: best.sheet.name,
    headerRow: best.row,
    headers,
    mapping: best.mapping,
    missingRequired: def.fields.filter((f) => f.required && !(f.id in best!.mapping)).map((f) => f.id),
    missingOptional: def.fields.filter((f) => !f.required && !(f.id in best!.mapping)).map((f) => f.id),
  };
}

export function cellText(c: Cell): string {
  if (c === null || c === undefined) return '';
  if (c instanceof Date) return c.toISOString().slice(0, 10);
  return String(c);
}

/** Excel serial number for a date (1900 system). */
export function dateToSerial(d: Date): number {
  const utc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((utc - Date.UTC(1899, 11, 30)) / 86400000);
}

function convert(c: Cell, type: InputField['type']): { v: Scalar; bad?: boolean } {
  if (c === null || c === undefined) return { v: null };
  if (typeof c === 'string' && c.trim() === '') return { v: null };
  switch (type) {
    case 'text':
      if (c instanceof Date) return { v: c.toISOString().slice(0, 10) };
      if (typeof c === 'number') return { v: Number.isInteger(c) ? String(c) : String(Number(c.toPrecision(15))) };
      return { v: String(c).trim() };
    case 'number': {
      if (typeof c === 'number') return { v: c };
      if (typeof c === 'boolean') return { v: c ? 1 : 0 };
      if (c instanceof Date) return { v: dateToSerial(c) };
      let s = c.trim().replace(/\s/g, '');
      let neg = false;
      if (/^\(.*\)$/.test(s)) {
        neg = true;
        s = s.slice(1, -1);
      }
      if (s === '-') return { v: 0 };
      s = s.replace(/,/g, '');
      const n = Number(s);
      if (!Number.isFinite(n)) return { v: null, bad: true };
      return { v: neg ? -n : n };
    }
    case 'date': {
      if (c instanceof Date) return { v: dateToSerial(c) };
      if (typeof c === 'number') return { v: c };
      const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(String(c).trim());
      if (m) return { v: dateToSerial(new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])))) };
      const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(c).trim());
      if (iso) return { v: dateToSerial(new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])))) };
      return { v: null, bad: true };
    }
  }
}

/** Read data rows using a (possibly user-corrected) mapping. */
export function readInput(sheets: RawSheet[], def: InputDef, proposal: MappingProposal): ParsedInput {
  const sheet = sheets.find((s) => s.name === proposal.sheet);
  if (!sheet) throw new Error(`Không thấy sheet "${proposal.sheet}"`);
  const rows: Record<string, Scalar>[] = [];
  const problems: string[] = [];
  let skippedBlankKey = 0;
  const keyIdx = proposal.mapping[def.key];
  for (let r = proposal.headerRow + 1; r < sheet.rows.length; r++) {
    const raw = sheet.rows[r] ?? [];
    if (raw.every((c) => c === null || c === undefined || (typeof c === 'string' && c.trim() === ''))) continue;
    const keyCell = keyIdx === undefined ? null : raw[keyIdx];
    if (keyCell === null || keyCell === undefined || String(keyCell).trim() === '') {
      skippedBlankKey++;
      continue;
    }
    const rec: Record<string, Scalar> = {};
    for (const f of def.fields) {
      const idx = proposal.mapping[f.id];
      if (idx === undefined) {
        rec[f.id] = null;
        continue;
      }
      const { v, bad } = convert(raw[idx], f.type);
      if (bad && problems.length < 200)
        problems.push(`${def.label || def.id} dòng ${r + 1}, cột "${proposal.headers[idx] ?? idx + 1}": "${cellText(raw[idx])}" không đọc được thành ${f.type === 'number' ? 'số' : 'ngày'}`);
      rec[f.id] = v;
    }
    rows.push(rec);
  }
  return {
    inputId: def.id,
    sheet: sheet.name,
    headerRow: proposal.headerRow,
    headers: proposal.headers,
    mapping: { ...proposal.mapping },
    rows,
    problems,
    skippedBlankKey,
  };
}
