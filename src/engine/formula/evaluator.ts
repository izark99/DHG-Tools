import { FormulaError, type Node } from './parser';
import { excelRound, excelRoundDown, excelRoundUp } from './round';

export type Scalar = number | string | boolean | null;
export type Value = Scalar | Value[];

/** How a reference is read: plain value, first match, sum of matches, or all values (array). */
export type RefMode = 'value' | 'first' | 'sum' | 'all';

/** A master table, indexed by its first column (the key column). */
export interface Table {
  name: string;
  columns: string[];
  rows: Record<string, Scalar>[];
}

export interface Env {
  /** `[id]` — an earlier column of the same row. */
  column(id: string): Value;
  /** `ns.path` references (in, P, run, row, emp, f02, f03). */
  ref(ns: string, path: string[], mode: RefMode): Value;
  /** Master-table lookup: row whose key column matches `key`, or undefined. */
  lookup(table: string, key: Value): Record<string, Scalar> | undefined;
  /** Employee rows of the current form row's unit (UNITSUM). */
  unitEmployees?(): Env[];
  /** Form rows of the current form row's unit (UNITCOUNT). */
  unitPeers?(): Env[];
  /** All rows of the current scope (COUNTSAME). */
  scopeRows?(): Env[];
  /** Value of a CostCenter column for the current unit (CC). */
  cc?(column: string): Value;
  /** Cache shared by all rows of one scope (COUNTSAME). */
  memo?: Map<unknown, unknown>;
}

export function keyOf(v: Value): string {
  if (Array.isArray(v)) throw new FormulaError('Khoá tra cứu không được là danh sách');
  return toStr(v).trim().toUpperCase();
}

function fmtNum(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(Number(n.toPrecision(15)));
}

export function toNum(v: Value): number {
  if (Array.isArray(v)) {
    if (v.length === 1) return toNum(v[0]);
    throw new FormulaError('Cần một giá trị, nhận được danh sách');
  }
  if (v === null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const s = v.trim().replace(/,/g, '');
  if (s === '') return 0;
  const n = Number(s);
  if (!Number.isFinite(n)) throw new FormulaError(`Không phải số: "${v}"`);
  return n;
}

export function toStr(v: Value): string {
  if (Array.isArray(v)) {
    if (v.length === 1) return toStr(v[0]);
    throw new FormulaError('Cần một giá trị, nhận được danh sách');
  }
  if (v === null) return '';
  if (typeof v === 'number') return fmtNum(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return v;
}

export function toBool(v: Value): boolean {
  if (Array.isArray(v)) {
    if (v.length === 1) return toBool(v[0]);
    throw new FormulaError('Cần một giá trị, nhận được danh sách');
  }
  if (v === null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const u = v.trim().toUpperCase();
  if (u === 'TRUE') return true;
  if (u === 'FALSE' || u === '') return false;
  throw new FormulaError(`Không phải TRUE/FALSE: "${v}"`);
}

function scalar(v: Value): Scalar {
  if (Array.isArray(v)) {
    if (v.length === 1) return scalar(v[0]);
    throw new FormulaError('Cần một giá trị, nhận được danh sách');
  }
  return v;
}

/** Excel-style comparison: numbers < text < booleans; text is case-insensitive; blank = 0 or "". */
export function compare(a: Value, b: Value): number {
  let x = scalar(a);
  let y = scalar(b);
  if (x === null && y === null) return 0;
  if (x === null) x = typeof y === 'string' ? '' : typeof y === 'boolean' ? false : 0;
  if (y === null) y = typeof x === 'string' ? '' : typeof x === 'boolean' ? false : 0;
  const rank = (v: Scalar) => (typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : 2);
  const rx = rank(x);
  const ry = rank(y);
  if (rx !== ry) return rx < ry ? -1 : 1;
  if (typeof x === 'string') {
    const s = x.toUpperCase();
    const t = (y as string).toUpperCase();
    return s < t ? -1 : s > t ? 1 : 0;
  }
  const nx = Number(x);
  const ny = Number(y);
  return nx < ny ? -1 : nx > ny ? 1 : 0;
}

function finite(n: number): number {
  if (!Number.isFinite(n)) throw new FormulaError('Kết quả không hợp lệ (#NUM!)');
  return n;
}

function flatten(vals: Value[], out: Scalar[] = []): Scalar[] {
  for (const v of vals) {
    if (Array.isArray(v)) flatten(v, out);
    else out.push(v);
  }
  return out;
}

type Ev = (n: Node, env: Env) => Value;
interface FnSpec {
  min: number;
  max: number;
  /** Scopes the function is allowed in; undefined = everywhere. */
  scopes?: string[];
  impl: (args: Node[], env: Env, ev: Ev) => Value;
}

const num = (n: Node, env: Env, ev: Ev) => toNum(ev(n, env));
const str = (n: Node, env: Env, ev: Ev) => toStr(ev(n, env));

function inRef(n: Node, fname: string): { ns: string; path: string[] } {
  if (n.k !== 'ref' || n.ns !== 'in' || n.path.length !== 2)
    throw new FormulaError(`${fname} cần tham chiếu dạng in.<Input>.<field>`, n.pos);
  return n;
}

function textFormat(v: Value, fmt: string): string {
  const f = fmt.trim();
  const n = toNum(v);
  const m = /^(#,##)?(0+)(?:\.(0+))?$/.exec(f);
  if (m) {
    const decimals = m[3]?.length ?? 0;
    const r = excelRound(n, decimals);
    let [ip, dp] = Math.abs(r).toFixed(decimals).split('.');
    ip = ip.padStart(m[2].length, '0');
    if (m[1]) ip = ip.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (r < 0 ? '-' : '') + ip + (dp ? '.' + dp : '');
  }
  const low = f.toLowerCase();
  if (/^[dmy/.\- ]+$/.test(low)) {
    // Excel serial date → text
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getUTCFullYear());
    return low
      .replace(/yyyy/g, yyyy)
      .replace(/yy/g, yyyy.slice(2))
      .replace(/dd/g, dd)
      .replace(/mm/g, mm);
  }
  return toStr(v);
}

export const FUNCTIONS: Record<string, FnSpec> = {
  IF: {
    min: 2,
    max: 3,
    impl: (a, env, ev) => (toBool(ev(a[0], env)) ? ev(a[1], env) : a[2] ? ev(a[2], env) : false),
  },
  IFS: {
    min: 2,
    max: 254,
    impl: (a, env, ev) => {
      if (a.length % 2) throw new FormulaError('IFS cần số tham số chẵn');
      for (let i = 0; i < a.length; i += 2) if (toBool(ev(a[i], env))) return ev(a[i + 1], env);
      throw new FormulaError('IFS: không điều kiện nào đúng (#N/A)');
    },
  },
  IFERROR: {
    min: 2,
    max: 2,
    impl: (a, env, ev) => {
      try {
        return ev(a[0], env);
      } catch (e) {
        if (e instanceof FormulaError) return ev(a[1], env);
        throw e;
      }
    },
  },
  AND: { min: 1, max: 255, impl: (a, env, ev) => a.every((x) => toBool(ev(x, env))) },
  OR: { min: 1, max: 255, impl: (a, env, ev) => a.some((x) => toBool(ev(x, env))) },
  NOT: { min: 1, max: 1, impl: (a, env, ev) => !toBool(ev(a[0], env)) },
  IN: {
    min: 2,
    max: 255,
    impl: (a, env, ev) => {
      const v = ev(a[0], env);
      return a.slice(1).some((x) => compare(v, ev(x, env)) === 0);
    },
  },
  SWITCH: {
    min: 3,
    max: 255,
    impl: (a, env, ev) => {
      const v = ev(a[0], env);
      let i = 1;
      for (; i + 1 < a.length; i += 2) if (compare(v, ev(a[i], env)) === 0) return ev(a[i + 1], env);
      if (i < a.length) return ev(a[i], env);
      throw new FormulaError('SWITCH: không khớp giá trị nào (#N/A)');
    },
  },
  ROUND: { min: 1, max: 2, impl: (a, env, ev) => excelRound(num(a[0], env, ev), a[1] ? num(a[1], env, ev) : 0) },
  ROUNDUP: { min: 1, max: 2, impl: (a, env, ev) => excelRoundUp(num(a[0], env, ev), a[1] ? num(a[1], env, ev) : 0) },
  ROUNDDOWN: {
    min: 1,
    max: 2,
    impl: (a, env, ev) => excelRoundDown(num(a[0], env, ev), a[1] ? num(a[1], env, ev) : 0),
  },
  MIN: {
    min: 1,
    max: 255,
    impl: (a, env, ev) => {
      const xs = flatten(a.map((x) => ev(x, env))).map(toNum);
      return xs.length ? Math.min(...xs) : 0;
    },
  },
  MAX: {
    min: 1,
    max: 255,
    impl: (a, env, ev) => {
      const xs = flatten(a.map((x) => ev(x, env))).map(toNum);
      return xs.length ? Math.max(...xs) : 0;
    },
  },
  ABS: { min: 1, max: 1, impl: (a, env, ev) => Math.abs(num(a[0], env, ev)) },
  SUM: {
    min: 1,
    max: 255,
    impl: (a, env, ev) => flatten(a.map((x) => ev(x, env))).reduce<number>((s, x) => s + toNum(x), 0),
  },
  COUNT: {
    min: 1,
    max: 255,
    impl: (a, env, ev) => flatten(a.map((x) => ev(x, env))).filter((x) => x !== null && x !== '').length,
  },
  LEFT: {
    min: 1,
    max: 2,
    impl: (a, env, ev) => str(a[0], env, ev).slice(0, a[1] ? Math.max(0, num(a[1], env, ev)) : 1),
  },
  RIGHT: {
    min: 1,
    max: 2,
    impl: (a, env, ev) => {
      const s = str(a[0], env, ev);
      const k = a[1] ? Math.max(0, num(a[1], env, ev)) : 1;
      return k === 0 ? '' : s.slice(-k);
    },
  },
  MID: {
    min: 3,
    max: 3,
    impl: (a, env, ev) => {
      const s = str(a[0], env, ev);
      const st = num(a[1], env, ev);
      if (st < 1) throw new FormulaError('MID: vị trí bắt đầu phải ≥ 1');
      return s.substr(st - 1, Math.max(0, num(a[2], env, ev)));
    },
  },
  LEN: { min: 1, max: 1, impl: (a, env, ev) => str(a[0], env, ev).length },
  TRIM: { min: 1, max: 1, impl: (a, env, ev) => str(a[0], env, ev).replace(/\s+/g, ' ').trim() },
  UPPER: { min: 1, max: 1, impl: (a, env, ev) => str(a[0], env, ev).toUpperCase() },
  LOWER: { min: 1, max: 1, impl: (a, env, ev) => str(a[0], env, ev).toLowerCase() },
  VALUE: { min: 1, max: 1, impl: (a, env, ev) => num(a[0], env, ev) },
  TEXT: { min: 2, max: 2, impl: (a, env, ev) => textFormat(ev(a[0], env), str(a[1], env, ev)) },
  ISNUMBER: {
    min: 1,
    max: 1,
    impl: (a, env, ev) => {
      const v = ev(a[0], env);
      return typeof v === 'number';
    },
  },
  ISBLANK: {
    min: 1,
    max: 1,
    impl: (a, env, ev) => {
      const v = ev(a[0], env);
      return v === null || (typeof v === 'string' && v.trim() === '');
    },
  },
  CONTAINS: {
    min: 2,
    max: 2,
    impl: (a, env, ev) => str(a[0], env, ev).toUpperCase().includes(str(a[1], env, ev).toUpperCase()),
  },
  FIRST: {
    min: 1,
    max: 1,
    scopes: ['employee'],
    impl: (a, env) => {
      const r = inRef(a[0], 'FIRST');
      return env.ref(r.ns, r.path, 'first');
    },
  },
  SUMOF: {
    min: 1,
    max: 1,
    scopes: ['employee'],
    impl: (a, env) => {
      const r = inRef(a[0], 'SUMOF');
      return env.ref(r.ns, r.path, 'sum');
    },
  },
  LOOKUP: {
    min: 3,
    max: 4,
    impl: (a, env, ev) => {
      const table = str(a[0], env, ev);
      const row = env.lookup(table, ev(a[1], env));
      const col = str(a[2], env, ev);
      if (row && col in row) {
        const v = row[col];
        if (v !== null && v !== '') return v;
      }
      if (a[3]) return ev(a[3], env);
      if (!row) throw new FormulaError(`LOOKUP: không tìm thấy "${toStr(ev(a[1], env))}" trong ${table} (#N/A)`);
      return null;
    },
  },
  LOOKUP2: {
    min: 3,
    max: 4,
    impl: (a, env, ev) => FUNCTIONS.LOOKUP.impl(a, env, ev),
  },
  EXISTS: {
    min: 2,
    max: 2,
    impl: (a, env, ev) => env.lookup(str(a[0], env, ev), ev(a[1], env)) !== undefined,
  },
  CC: {
    min: 1,
    max: 1,
    scopes: ['employee', 'form', 'unit'],
    impl: (a, env, ev) => {
      if (!env.cc) throw new FormulaError('CC() không dùng được ở đây');
      return env.cc(str(a[0], env, ev));
    },
  },
  UNITSUM: {
    min: 1,
    max: 1,
    scopes: ['form'],
    impl: (a, env, ev) => {
      if (!env.unitEmployees) throw new FormulaError('UNITSUM chỉ dùng trong cột của Form');
      let s = 0;
      for (const e of env.unitEmployees()) s += toNum(ev(a[0], e));
      return s;
    },
  },
  UNITCOUNT: {
    min: 1,
    max: 1,
    scopes: ['form'],
    impl: (a, env, ev) => {
      if (!env.unitPeers) throw new FormulaError('UNITCOUNT chỉ dùng trong Form');
      let c = 0;
      for (const e of env.unitPeers()) if (toBool(ev(a[0], e))) c++;
      return c;
    },
  },
  COUNTSAME: {
    min: 1,
    max: 1,
    scopes: ['employee', 'form'],
    impl: (a, env, ev) => {
      if (!env.scopeRows) throw new FormulaError('COUNTSAME không dùng được ở đây');
      const vk = (v: Value) => {
        const x = scalar(v);
        return typeof x === 'number' ? `n${x}` : typeof x === 'boolean' ? `b${x}` : `s${(x ?? '').toUpperCase()}`;
      };
      let counts = env.memo?.get(a[0]) as Map<string, number> | undefined;
      if (!counts) {
        counts = new Map();
        for (const e of env.scopeRows()) {
          const k = vk(ev(a[0], e));
          counts.set(k, (counts.get(k) ?? 0) + 1);
        }
        env.memo?.set(a[0], counts);
      }
      return counts.get(vk(ev(a[0], env))) ?? 0;
    },
  },
};

export function evaluate(node: Node, env: Env): Value {
  switch (node.k) {
    case 'num':
      return node.v;
    case 'str':
      return node.v;
    case 'bool':
      return node.v;
    case 'col':
      return env.column(node.id);
    case 'ref':
      return env.ref(node.ns, node.path, 'value');
    case 'un': {
      const v = toNum(evaluate(node.e, env));
      return node.op === '-' ? -v : v;
    }
    case 'in': {
      const v = evaluate(node.e, env);
      return node.list.some((x) => compare(v, evaluate(x, env)) === 0);
    }
    case 'call': {
      const f = FUNCTIONS[node.name];
      if (!f) throw new FormulaError(`Hàm không hỗ trợ: ${node.name}`, node.pos);
      if (node.args.length < f.min || node.args.length > f.max)
        throw new FormulaError(`${node.name}: sai số tham số`, node.pos);
      return f.impl(node.args, env, evaluate);
    }
    case 'bin': {
      const op = node.op;
      if (op === '&') return toStr(evaluate(node.l, env)) + toStr(evaluate(node.r, env));
      if (op === '=' || op === '<>' || op === '<' || op === '<=' || op === '>' || op === '>=') {
        const c = compare(evaluate(node.l, env), evaluate(node.r, env));
        switch (op) {
          case '=':
            return c === 0;
          case '<>':
            return c !== 0;
          case '<':
            return c < 0;
          case '<=':
            return c <= 0;
          case '>':
            return c > 0;
          default:
            return c >= 0;
        }
      }
      const l = toNum(evaluate(node.l, env));
      const r = toNum(evaluate(node.r, env));
      switch (op) {
        case '+':
          return finite(l + r);
        case '-':
          return finite(l - r);
        case '*':
          return finite(l * r);
        case '/':
          if (r === 0) throw new FormulaError('Chia cho 0 (#DIV/0!)', node.pos);
          return finite(l / r);
        case '^':
          return finite(Math.pow(l, r));
      }
      throw new FormulaError(`Toán tử lạ ${op}`, node.pos);
    }
  }
}
