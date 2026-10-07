import { FormulaError, parse, type Node } from './parser';
import { FUNCTIONS } from './evaluator';

export type Scope = 'employee' | 'form' | 'total' | 'unit';

export interface ScopeInfo {
  scope: Scope;
  /** `[id]` references that are allowed (earlier columns of the same row). */
  columns: string[];
  /** Every column id of the scope, to tell a forward/circular reference from an unknown one. */
  allColumns?: string[];
  /** input id → field ids */
  inputs: Record<string, string[]>;
  /** Params keys; null = unknown, do not check. */
  params: string[] | null;
  /** run.<id> */
  run: string[];
  /** row.<field> (form / unit scope) */
  rowFields?: string[];
  /** emp.<col> (inside UNITSUM in form scope; arrays in total scope) */
  empColumns?: string[];
  /** f02.<col> / f03.<col> (total scope) */
  formColumns?: Record<string, string[]>;
  /** master table name → columns; null = unknown, do not check. */
  tables: Record<string, string[]> | null;
}

export interface Analysis {
  errors: string[];
  /** `[id]` references used (for dependency ordering). */
  columnRefs: string[];
}

export function analyzeFormula(src: string, info: ScopeInfo): Analysis {
  const errors: string[] = [];
  const columnRefs: string[] = [];
  let node: Node;
  try {
    node = parse(src);
  } catch (e) {
    if (e instanceof FormulaError) return { errors: [posMsg(e.message, e.pos)], columnRefs };
    throw e;
  }

  const bound: string[] = [];
  const visit = (n: Node, ctx: 'normal' | 'unitsum') => {
    switch (n.k) {
      case 'name':
        if (!bound.includes(n.id)) errors.push(`Tên không xác định "${n.id}"`);
        return;
      case 'num':
      case 'str':
      case 'bool':
        return;
      case 'col': {
        if (ctx === 'unitsum') {
          errors.push(`[${n.id}]: trong UNITSUM dùng emp.<cột> để lấy cột của bảng nhân viên`);
          return;
        }
        columnRefs.push(n.id);
        if (!info.columns.includes(n.id)) {
          if (info.allColumns?.includes(n.id))
            errors.push(`[${n.id}]: tham chiếu tới cột đứng sau hoặc vòng lặp (chỉ được dùng cột phía trước)`);
          else errors.push(`[${n.id}]: không có cột này`);
        }
        return;
      }
      case 'ref':
        checkRef(n, ctx);
        return;
      case 'un':
        visit(n.e, ctx);
        return;
      case 'bin':
        visit(n.l, ctx);
        visit(n.r, ctx);
        return;
      case 'in':
        visit(n.e, ctx);
        n.list.forEach((x) => visit(x, ctx));
        return;
      case 'call': {
        const f = FUNCTIONS[n.name];
        if (!f) {
          errors.push(`Hàm không hỗ trợ: ${n.name}`);
          n.args.forEach((x) => visit(x, ctx));
          return;
        }
        if (n.args.length < f.min || n.args.length > f.max)
          errors.push(`${n.name}: cần ${f.min === f.max ? f.min : `${f.min}–${f.max}`} tham số, có ${n.args.length}`);
        const effScope = ctx === 'unitsum' ? 'employee' : info.scope;
        if (f.scopes && !f.scopes.includes(effScope)) errors.push(`${n.name} không dùng được trong phạm vi này`);
        if ((n.name === 'FIRST' || n.name === 'SUMOF') && n.args[0]) {
          const a = n.args[0];
          if (a.k !== 'ref' || a.ns !== 'in') errors.push(`${n.name} cần tham chiếu in.<Input>.<field>`);
        }
        if ((n.name === 'LOOKUP' || n.name === 'LOOKUP2' || n.name === 'EXISTS') && info.tables) {
          const t = n.args[0];
          if (t?.k === 'str') {
            const cols = info.tables[t.v];
            if (!cols) errors.push(`${n.name}: không có bảng master "${t.v}"`);
            else if (n.name === 'LOOKUP' && n.args[2]?.k === 'str' && !cols.includes((n.args[2] as { v: string }).v))
              errors.push(`LOOKUP: bảng "${t.v}" không có cột "${(n.args[2] as { v: string }).v}"`);
          }
        }
        const childCtx = n.name === 'UNITSUM' || n.name === 'ROWSUM' ? 'unitsum' : ctx;
        if (n.name === 'LET') {
          const before = bound.length;
          for (let i = 0; i + 1 < n.args.length; i += 2) {
            const nm = n.args[i];
            visit(n.args[i + 1], childCtx);
            if (nm.k === 'name') bound.push(nm.id);
            else errors.push('LET: tên biến phải là chữ không dấu chấm');
          }
          if (n.args.length % 2 === 1) visit(n.args[n.args.length - 1], childCtx);
          bound.length = before;
          return;
        }
        n.args.forEach((x) => visit(x, childCtx));
        return;
      }
    }
  };

  const checkRef = (n: Extract<Node, { k: 'ref' }>, ctx: 'normal' | 'unitsum') => {
    const full = `${n.ns}.${n.path.join('.')}`;
    const scope = ctx === 'unitsum' ? 'employee' : info.scope;
    switch (n.ns) {
      case 'in': {
        if (scope !== 'employee' && scope !== 'total') {
          errors.push(`${full}: dữ liệu input chỉ dùng trong bảng nhân viên (hoặc trong UNITSUM)`);
          return;
        }
        if (n.path.length !== 2) {
          errors.push(`${full}: dạng đúng là in.<Input>.<field>`);
          return;
        }
        const fields = info.inputs[n.path[0]];
        if (!fields) errors.push(`${full}: không có input "${n.path[0]}"`);
        else if (!fields.includes(n.path[1])) errors.push(`${full}: input "${n.path[0]}" không có field "${n.path[1]}"`);
        return;
      }
      case 'P':
        if (n.path.length !== 1) errors.push(`${full}: dạng đúng là P.<key>`);
        else if (info.params && !info.params.includes(n.path[0])) errors.push(`${full}: Params không có key "${n.path[0]}"`);
        return;
      case 'run':
        if (n.path.length !== 1 || !info.run.includes(n.path[0])) errors.push(`${full}: không có tham số chạy này`);
        return;
      case 'row':
        if (ctx === 'unitsum' || !info.rowFields) errors.push(`${full}: row.* chỉ dùng trong Form / bộ lọc đơn vị`);
        else if (n.path.length !== 1 || !info.rowFields.includes(n.path[0])) errors.push(`${full}: không có field này`);
        return;
      case 'emp': {
        if (n.path.length !== 1) {
          errors.push(`${full}: dạng đúng là emp.<cột>`);
          return;
        }
        if (scope === 'employee' && ctx === 'normal') {
          columnRefs.push(n.path[0]);
          if (!info.columns.includes(n.path[0])) errors.push(`${full}: chỉ được dùng cột phía trước`);
          return;
        }
        if (ctx === 'unitsum' || info.scope === 'total') {
          if (!info.empColumns?.includes(n.path[0])) errors.push(`${full}: bảng nhân viên không có cột này`);
          return;
        }
        errors.push(`${full}: emp.* chỉ dùng trong UNITSUM(...)`);
        return;
      }
      case 'f02':
      case 'f03': {
        const cols = info.formColumns?.[n.ns];
        if (info.scope !== 'total' || !cols) errors.push(`${full}: chỉ dùng trong kiểm tra phạm vi "total"`);
        else if (n.path.length !== 1 || !cols.includes(n.path[0])) errors.push(`${full}: không có cột này`);
        return;
      }
      default:
        errors.push(`${full}: không hiểu tham chiếu (dùng in., P., run., row., emp., f02., f03.)`);
    }
  };

  visit(node, 'normal');
  return { errors: [...new Set(errors)], columnRefs };
}

function posMsg(msg: string, pos?: number): string {
  return pos === undefined ? msg : `${msg} (vị trí ${pos + 1})`;
}
