import { describe, expect, it } from 'vitest';
import { evaluate, type Env, type Value } from './evaluator';
import { parse } from './parser';
import { excelRound, excelRoundDown, excelRoundUp } from './round';
import { analyzeFormula } from './analyze';

const env = (cols: Record<string, Value> = {}, refs: Record<string, Value> = {}): Env => ({
  column: (id) => {
    if (!(id in cols)) throw new Error('no col ' + id);
    return cols[id];
  },
  ref: (ns, path) => refs[`${ns}.${path.join('.')}`] ?? null,
  lookup: (t, k) => (t === 'T' && String(k).toUpperCase() === 'A' ? { key: 'A', val: 5 } : undefined),
});
const ev = (src: string, cols?: Record<string, Value>, refs?: Record<string, Value>) => evaluate(parse(src), env(cols, refs));

describe('Excel rounding', () => {
  it('rounds half away from zero', () => {
    expect(excelRound(-2.5, 0)).toBe(-3);
    expect(excelRound(2.5, 0)).toBe(3);
    expect(excelRound(1.005, 2)).toBe(1.01);
    expect(excelRound(-1.005, 2)).toBe(-1.01);
    expect(excelRound(0.5)).toBe(1);
    expect(excelRound(-0.5)).toBe(-1);
    expect(excelRound(1234567.5)).toBe(1234568);
    expect(excelRound(1250, -2)).toBe(1300);
    expect(excelRound(-1250, -2)).toBe(-1300);
    expect(excelRound(2.675, 2)).toBe(2.68);
    expect(excelRound(0.285, 2)).toBe(0.29);
  });
  it('ROUND via formula', () => {
    expect(ev('ROUND(-2.5,0)')).toBe(-3);
    expect(ev('ROUND(2.5,0)')).toBe(3);
    expect(ev('ROUND(1.005,2)')).toBe(1.01);
  });
  it('ROUNDUP / ROUNDDOWN away from / toward zero', () => {
    expect(excelRoundUp(1.21, 1)).toBe(1.3);
    expect(excelRoundUp(-1.21, 1)).toBe(-1.3);
    expect(excelRoundDown(1.29, 1)).toBe(1.2);
    expect(excelRoundDown(-1.29, 1)).toBe(-1.2);
    expect(excelRoundUp(0.1 + 0.2, 1)).toBe(0.3);
    expect(excelRoundUp(1000.0000000001, 0)).toBe(1001);
  });
});

describe('formula language', () => {
  it('precedence like Excel', () => {
    expect(ev('1+2*3')).toBe(7);
    expect(ev('-2^2')).toBe(4);
    expect(ev('2^3^2')).toBe(64);
    expect(ev('1+2&"x"')).toBe('3x');
    expect(ev('1+1=2')).toBe(true);
    expect(ev('(1+2)*3')).toBe(9);
  });
  it('blank is 0 / "" and text compare is case-insensitive', () => {
    expect(ev('[a]+1', { a: null })).toBe(1);
    expect(ev('[a]&"x"', { a: null })).toBe('x');
    expect(ev('"abc"="ABC"')).toBe(true);
    expect(ev('ISBLANK([a])', { a: null })).toBe(true);
  });
  it('division by zero is an error, not NaN', () => {
    expect(() => ev('1/0')).toThrow(/DIV/);
  });
  it('IF is lazy; IN works as function and infix', () => {
    expect(ev('IF(TRUE, 1, 1/0)')).toBe(1);
    expect(ev('IN("b","a","b")')).toBe(true);
    expect(ev('row.costCode IN ("0301","0319")', {}, { 'row.costCode': '0319' })).toBe(true);
    expect(ev('row.costCode IN ("0301")', {}, { 'row.costCode': '301' })).toBe(false);
  });
  it('text functions', () => {
    expect(ev('LEFT("WH1A",2)')).toBe('WH');
    expect(ev('RIGHT("U12",1)')).toBe('2');
    expect(ev('MID("ABCDE",2,3)')).toBe('BCD');
    expect(ev('TRIM("  a   b ")')).toBe('a b');
    expect(ev('TEXT(9,"00")')).toBe('09');
    expect(ev('TEXT(1234567.4,"#,##0")')).toBe('1,234,567');
    expect(ev('CONTAINS("UZ1","z")')).toBe(true);
    expect(ev('LEN("0022")')).toBe(4);
  });
  it('IFS / SWITCH / IFERROR / LOOKUP', () => {
    expect(ev('IFS(FALSE,1,TRUE,2)')).toBe(2);
    expect(ev('SWITCH("b","a",1,"b",2,9)')).toBe(2);
    expect(ev('SWITCH("z","a",1,9)')).toBe(9);
    expect(ev('IFERROR(1/0, 7)')).toBe(7);
    expect(ev('LOOKUP("T","a","val",0)')).toBe(5);
    expect(ev('LOOKUP("T","x","val",0)')).toBe(0);
    expect(() => ev('LOOKUP("T","x","val")')).toThrow(/N\/A/);
  });
  it('rejects unknown names and characters', () => {
    expect(() => ev('foo + 1')).toThrow(/không xác định/);
    expect(() => parse('1 +')).toThrow();
    expect(() => parse('"abc')).toThrow();
    expect(() => parse('1 $ 2')).toThrow();
  });
});

describe('analyzer', () => {
  const base = { inputs: { S: ['id', 'x'] }, params: ['rate'], run: ['month', 'year'], tables: { T: ['key', 'val'] } };
  it('flags unknown function, arity, refs, forward refs', () => {
    const info = { ...base, scope: 'employee' as const, columns: ['a'], allColumns: ['a', 'b', 'c'] };
    expect(analyzeFormula('FOO(1)', info).errors[0]).toMatch(/không hỗ trợ/);
    expect(analyzeFormula('ROUND(1,2,3)', info).errors[0]).toMatch(/tham số/);
    expect(analyzeFormula('[c]+1', info).errors[0]).toMatch(/đứng sau/);
    expect(analyzeFormula('[zz]', info).errors[0]).toMatch(/không có cột/);
    expect(analyzeFormula('in.S.y', info).errors[0]).toMatch(/field/);
    expect(analyzeFormula('P.nope', info).errors[0]).toMatch(/Params/);
    expect(analyzeFormula('LOOKUP("T", [a], "nope", 0)', info).errors[0]).toMatch(/không có cột/);
    expect(analyzeFormula('[a] * P.rate + SUMOF(in.S.x)', info).errors).toEqual([]);
    expect(analyzeFormula('UNITSUM([a])', info).errors.length).toBeGreaterThan(0);
  });
  it('UNITSUM is form-scope only and uses emp.*', () => {
    const info = { ...base, scope: 'form' as const, columns: [], rowFields: ['costCode'], empColumns: ['si'] };
    expect(analyzeFormula('IF(row.costCode IN ("1"), UNITSUM(emp.si), 0)', info).errors).toEqual([]);
    expect(analyzeFormula('UNITSUM(emp.nope)', info).errors.length).toBe(1);
    expect(analyzeFormula('emp.si', info).errors.length).toBe(1);
  });
});

describe('Excel functions used by the workbook translations', () => {
  const rows: Record<string, Value> = {
    'in.D.luong': [100, 200, 300, 400],
    'in.D.loai': ['Thưởng KPI quý', 'Thưởng Đạt Khoán Quý (+)', 'Lương (+)', 'Thưởng KPI năm'],
    'in.D.tinh': ['Medical Representative', 'Medical Representative', 'Others', 'Others'],
  };
  const e: Env = {
    column: () => null,
    ref: (ns, path) => rows[`${ns}.${path.join('.')}`] ?? null,
    lookup: () => undefined,
  };
  const f = (src: string) => evaluate(parse(src), e);
  it('SUMIFS with wildcard, <> and exact criteria', () => {
    expect(f('SUMIFS(in.D.luong, in.D.loai, "Thưởng KPI*")')).toBe(500);
    expect(f('SUMIFS(in.D.luong, in.D.loai, "Thưởng KPI*", in.D.tinh, "Medical Representative")')).toBe(100);
    expect(f('SUMIFS(in.D.luong, in.D.tinh, "<>" & "Medical Representative")')).toBe(700);
    expect(f('SUMIFS(in.D.luong, in.D.loai, "thưởng đạt khoán quý (+)")')).toBe(200);
    expect(f('SUMIFS(in.D.luong, in.D.luong, ">=300")')).toBe(700);
    expect(f('COUNTIFS(in.D.tinh, "Others")')).toBe(2);
  });
  it('text and date helpers', () => {
    expect(f('SUBSTITUTE("Trích Lương_T09", "Trích", "Chi")')).toBe('Chi Lương_T09');
    expect(f('TEXTBEFORE("2 * Base Salary", " * ")')).toBe('2');
    expect(f('TEXTAFTER("Thưởng quý - BU2", "-")')).toBe(' BU2');
    expect(f('PROPER("hỗ trợ tiền VƯỢT kilomet")')).toBe('Hỗ Trợ Tiền Vượt Kilomet');
    expect(f('TEXTJOIN(" ", TRUE, "A", "", "B")')).toBe('A B');
    expect(f('TEXT(MONTH(EOMONTH(DATE(2026,12,1),1)),"00") & "." & YEAR(EOMONTH(DATE(2026,12,1),1))')).toBe('01.2027');
    expect(f('ISNUMBER(VALUE("2 * Base Salary"))')).toBe(false);
    expect(f('ISNUMBER(VALUE("1500000"))')).toBe(true);
    expect(f('ISERROR(1/0)')).toBe(true);
  });
});

describe('LET, mixed fractions, case-insensitive lookup column', () => {
  const e: Env = {
    column: () => 5_000_000,
    ref: () => null,
    lookup: (t, k) => (t === 'S' && String(k) === 'G' ? { Group: 'G', 'Thưởng Thu Tiền Quý': '0 1/6 * Base Salary', Fix: 3000000 } : undefined),
  };
  const f = (src: string) => evaluate(parse(src), e);
  it('evaluates scheme cells that hold a number or "x * Base Salary"', () => {
    const tpl = (col: string) =>
      `LET(x, LOOKUP2("S", "G", "${col}"), ROUND(IF(ISNUMBER(VALUE(x)), x, VALUE(TEXTBEFORE(x, " * ")) * [base]), 0))`;
    expect(f(tpl('thưởng thu tiền quý'))).toBe(833333);
    expect(f(tpl('Fix'))).toBe(3000000);
    expect(f('VALUE("0 1/6")')).toBeCloseTo(1 / 6);
  });
  it('rejects unbound names', () => {
    expect(() => f('x + 1')).toThrow(/không xác định/);
  });
});
