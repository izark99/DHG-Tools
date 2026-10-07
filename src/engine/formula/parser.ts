// Tokenizer + recursive-descent parser for the formula language (PLAN §6).
// Never uses eval / new Function.

export class FormulaError extends Error {
  constructor(message: string, public pos?: number) {
    super(message);
    this.name = 'FormulaError';
  }
}

export type Node =
  | { k: 'num'; v: number; pos: number }
  | { k: 'str'; v: string; pos: number }
  | { k: 'bool'; v: boolean; pos: number }
  | { k: 'col'; id: string; pos: number }
  | { k: 'ref'; ns: string; path: string[]; pos: number }
  | { k: 'call'; name: string; args: Node[]; pos: number }
  | { k: 'bin'; op: string; l: Node; r: Node; pos: number }
  | { k: 'un'; op: '-' | '+'; e: Node; pos: number }
  | { k: 'in'; e: Node; list: Node[]; pos: number }
  | { k: 'name'; id: string; pos: number };

type Tok =
  | { t: 'num'; v: number; pos: number }
  | { t: 'str'; v: string; pos: number }
  | { t: 'col'; v: string; pos: number }
  | { t: 'id'; v: string; pos: number }
  | { t: 'op'; v: string; pos: number }
  | { t: 'eof'; pos: number };

const ID_START = /[\p{L}_]/u;
const ID_PART = /[\p{L}\p{N}_]/u;

export function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }
    const start = i;
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      while (i < n && /[0-9]/.test(src[i])) i++;
      if (src[i] === '.') {
        i++;
        while (i < n && /[0-9]/.test(src[i])) i++;
      }
      if ((src[i] === 'e' || src[i] === 'E') && /[-+0-9]/.test(src[i + 1] ?? '')) {
        let j = i + 1;
        if (src[j] === '+' || src[j] === '-') j++;
        if (/[0-9]/.test(src[j] ?? '')) {
          i = j;
          while (i < n && /[0-9]/.test(src[i])) i++;
        }
      }
      out.push({ t: 'num', v: Number(src.slice(start, i)), pos: start });
      continue;
    }
    if (c === '"') {
      i++;
      let s = '';
      for (;;) {
        if (i >= n) throw new FormulaError('Chuỗi chưa đóng dấu "', start);
        if (src[i] === '"') {
          if (src[i + 1] === '"') {
            s += '"';
            i += 2;
            continue;
          }
          i++;
          break;
        }
        s += src[i++];
      }
      out.push({ t: 'str', v: s, pos: start });
      continue;
    }
    if (c === '[') {
      const end = src.indexOf(']', i + 1);
      if (end < 0) throw new FormulaError('Thiếu dấu ]', start);
      const id = src.slice(i + 1, end).trim();
      if (!id) throw new FormulaError('Tham chiếu cột rỗng []', start);
      out.push({ t: 'col', v: id, pos: start });
      i = end + 1;
      continue;
    }
    if (ID_START.test(c)) {
      i++;
      for (;;) {
        while (i < n && ID_PART.test(src[i])) i++;
        if (src[i] === '.' && i + 1 < n && ID_PART.test(src[i + 1])) {
          i++;
          continue;
        }
        break;
      }
      out.push({ t: 'id', v: src.slice(start, i), pos: start });
      continue;
    }
    const two = src.slice(i, i + 2);
    if (two === '<>' || two === '<=' || two === '>=') {
      out.push({ t: 'op', v: two, pos: start });
      i += 2;
      continue;
    }
    if ('+-*/^&=<>(),;'.includes(c)) {
      out.push({ t: 'op', v: c === ';' ? ',' : c, pos: start });
      i++;
      continue;
    }
    throw new FormulaError(`Ký tự không hợp lệ "${c}"`, start);
  }
  out.push({ t: 'eof', pos: n });
  return out;
}

export function parse(src: string): Node {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => {
    const t = toks[p];
    return t.t === 'op' && t.v === v;
  };
  const expectOp = (v: string) => {
    if (!isOp(v)) throw new FormulaError(`Thiếu "${v}"`, peek().pos);
    p++;
  };
  const isKw = (v: string) => {
    const t = toks[p];
    return t.t === 'id' && t.v.toUpperCase() === v;
  };

  function compare(): Node {
    let l = concat();
    for (;;) {
      const t = peek();
      if (t.t === 'op' && ['=', '<>', '<', '<=', '>', '>='].includes(t.v)) {
        p++;
        l = { k: 'bin', op: t.v, l, r: concat(), pos: t.pos };
        continue;
      }
      if (isKw('IN')) {
        const pos = peek().pos;
        p++;
        expectOp('(');
        const list: Node[] = [];
        if (!isOp(')')) {
          list.push(compare());
          while (isOp(',')) {
            p++;
            list.push(compare());
          }
        }
        expectOp(')');
        l = { k: 'in', e: l, list, pos };
        continue;
      }
      return l;
    }
  }
  function concat(): Node {
    let l = additive();
    while (isOp('&')) {
      const pos = peek().pos;
      p++;
      l = { k: 'bin', op: '&', l, r: additive(), pos };
    }
    return l;
  }
  function additive(): Node {
    let l = mult();
    while (isOp('+') || isOp('-')) {
      const t = peek() as { v: string; pos: number };
      p++;
      l = { k: 'bin', op: t.v, l, r: mult(), pos: t.pos };
    }
    return l;
  }
  function mult(): Node {
    let l = power();
    while (isOp('*') || isOp('/')) {
      const t = peek() as { v: string; pos: number };
      p++;
      l = { k: 'bin', op: t.v, l, r: power(), pos: t.pos };
    }
    return l;
  }
  function power(): Node {
    let l = unary();
    while (isOp('^')) {
      const pos = peek().pos;
      p++;
      l = { k: 'bin', op: '^', l, r: unary(), pos };
    }
    return l;
  }
  function unary(): Node {
    if (isOp('-') || isOp('+')) {
      const t = peek() as { v: '-' | '+'; pos: number };
      p++;
      return { k: 'un', op: t.v, e: unary(), pos: t.pos };
    }
    return primary();
  }
  function primary(): Node {
    const t = peek();
    switch (t.t) {
      case 'num':
        p++;
        return { k: 'num', v: t.v, pos: t.pos };
      case 'str':
        p++;
        return { k: 'str', v: t.v, pos: t.pos };
      case 'col':
        p++;
        return { k: 'col', id: t.v, pos: t.pos };
      case 'op':
        if (t.v === '(') {
          p++;
          const e = compare();
          expectOp(')');
          return e;
        }
        throw new FormulaError(`Không mong đợi "${t.v}"`, t.pos);
      case 'eof':
        throw new FormulaError('Công thức kết thúc đột ngột', t.pos);
      case 'id': {
        p++;
        if (isOp('(')) {
          if (t.v.includes('.')) throw new FormulaError(`Tên hàm không hợp lệ "${t.v}"`, t.pos);
          p++;
          const args: Node[] = [];
          if (!isOp(')')) {
            args.push(compare());
            while (isOp(',')) {
              p++;
              args.push(compare());
            }
          }
          expectOp(')');
          return { k: 'call', name: t.v.toUpperCase(), args, pos: t.pos };
        }
        const up = t.v.toUpperCase();
        if (up === 'TRUE') return { k: 'bool', v: true, pos: t.pos };
        if (up === 'FALSE') return { k: 'bool', v: false, pos: t.pos };
        const parts = t.v.split('.');
        if (parts.length < 2) return { k: 'name', id: t.v.toLowerCase(), pos: t.pos };
        return { k: 'ref', ns: parts[0], path: parts.slice(1), pos: t.pos };
      }
    }
  }

  if (toks.length === 1) throw new FormulaError('Công thức rỗng', 0);
  const node = compare();
  if (peek().t !== 'eof') throw new FormulaError('Dư ký tự sau công thức', peek().pos);
  return node;
}

/** Walk every node of a tree. */
export function walk(node: Node, fn: (n: Node) => void): void {
  fn(node);
  switch (node.k) {
    case 'call':
      node.args.forEach((a) => walk(a, fn));
      break;
    case 'bin':
      walk(node.l, fn);
      walk(node.r, fn);
      break;
    case 'un':
      walk(node.e, fn);
      break;
    case 'in':
      walk(node.e, fn);
      node.list.forEach((a) => walk(a, fn));
      break;
  }
}
