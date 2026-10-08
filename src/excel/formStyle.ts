// Print style of Form 02 / 03 with every default filled in. Shared by the Excel writer and the
// editor's print preview, so both always agree.
import type { FormColumn, FormStyle } from '../engine/types';

export interface ResolvedStyle {
  fontName: string;
  fontSize: number;
  titleSize: number;
  headerFill: string;
  headerColor: string;
  border: 'thin' | 'medium' | 'hair' | 'none';
  numFmt: string;
  rowHeight: number | null;
  headerHeight: number | null;
  totalBold: boolean;
  paperSize: 'A4' | 'A3';
  margins: 'narrow' | 'normal' | 'wide';
  fitWidth: boolean;
  gridLines: boolean;
}

const hex = (v: string | undefined, d: string) => {
  if (v === undefined) return d;
  const x = v.replace(/^#/, '').trim().toUpperCase();
  return x === '' ? '' : /^[0-9A-F]{6}$/.test(x) ? x : d;
};

export function resolveStyle(s: FormStyle | undefined): ResolvedStyle {
  const n = (v: number | undefined, d: number, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d);
  return {
    fontName: s?.fontName?.trim() || 'Calibri',
    fontSize: n(s?.fontSize, 11, 6, 36),
    titleSize: n(s?.titleSize, 14, 6, 48),
    headerFill: hex(s?.headerFill, 'E7EEF7'),
    headerColor: hex(s?.headerColor, '000000') || '000000',
    border: s?.border ?? 'thin',
    numFmt: s?.numFmt?.trim() || '#,##0',
    rowHeight: s?.rowHeight ? n(s.rowHeight, 15, 8, 200) : null,
    headerHeight: s?.headerHeight ? n(s.headerHeight, 30, 8, 200) : null,
    totalBold: s?.totalBold ?? true,
    paperSize: s?.paperSize ?? 'A4',
    margins: s?.margins ?? 'normal',
    fitWidth: s?.fitWidth ?? true,
    gridLines: s?.gridLines ?? false,
  };
}

/** Page margins in inches. */
export const MARGINS = {
  narrow: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
  normal: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
  wide: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
} as const;

export const FONT_CHOICES = ['Calibri', 'Arial', 'Times New Roman', 'Tahoma', 'Cambria', 'Segoe UI'];

export const NUMFMT_CHOICES = [
  { value: '#,##0', label: '1,234,567' },
  { value: '#,##0;(#,##0)', label: '(1,234,567) cho số âm' },
  { value: '#,##0;[Red]-#,##0', label: '-1,234,567 màu đỏ cho số âm' },
  { value: '#,##0.00', label: '1,234,567.89' },
  { value: '#,##0;-#,##0;"-"', label: 'số 0 hiện "-"' },
];

/** Text of a number in one of the formats above (for the preview). */
export function formatNum(v: number, fmt: string): { text: string; red: boolean } {
  const parts = fmt.split(';');
  const neg = v < 0;
  const dec = /\.0+/.exec(parts[0])?.[0].length ? /\.(0+)/.exec(parts[0])![1].length : 0;
  const abs = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  if (v === 0 && parts[2]) return { text: parts[2].replace(/"/g, ''), red: false };
  if (neg && parts[1]) {
    const p = parts[1];
    return { text: p.includes('(') ? `(${abs})` : `-${abs}`, red: /\[Red\]/i.test(p) };
  }
  return { text: neg ? `-${abs}` : abs, red: false };
}

export function cellAlign(c: FormColumn): 'left' | 'center' | 'right' {
  return c.align ?? (c.type === 'number' ? 'right' : 'left');
}

export function cellWrap(c: FormColumn): boolean {
  return c.wrap ?? /desc/i.test(c.id);
}
