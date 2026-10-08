// Static validation of a flow configuration (PLAN §6: unknown reference, unknown function,
// wrong arity, circular / forward reference). A flow with errors cannot be published.
import { analyzeFormula, type ScopeInfo } from './formula/analyze';
import { RESERVED_RUN, scopeFor, type FormulaSite } from './scopes';
import { ID_PATTERN, ROW_FIELDS, type FlowConfig, type FormDef, type MasterTable } from './types';

export interface ConfigError {
  path: string;
  message: string;
}

export interface ValidationContext {
  /** Master tables (name → columns); null = not known, skip table checks. */
  tables: Record<string, string[]> | null;
  /** Params keys; null = not known. */
  params: string[] | null;
}

export function contextFromMasters(masters: Record<string, MasterTable> | MasterTable[]): ValidationContext {
  const list = Array.isArray(masters) ? masters : Object.values(masters);
  const tables: Record<string, string[]> = {};
  for (const t of list) tables[t.name] = t.columns;
  const p = list.find((t) => t.name === 'Params');
  return {
    tables,
    params: p ? p.rows.map((r) => String(r[0] ?? '').trim()).filter(Boolean) : [],
  };
}

export function validateConfig(cfg: FlowConfig, vctx: ValidationContext): ConfigError[] {
  const errs: ConfigError[] = [];
  const err = (path: string, message: string) => errs.push({ path, message });
  const dupCheck = (ids: string[], path: string, what: string) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (!ID_PATTERN.test(id)) err(path, `${what} "${id}": id chỉ gồm chữ không dấu, số, "_" và không bắt đầu bằng số`);
      if (seen.has(id)) err(path, `${what} "${id}" bị trùng`);
      seen.add(id);
    }
  };

  if (!cfg || typeof cfg !== 'object') return [{ path: '', message: 'Config không hợp lệ' }];
  if (!cfg.id || !ID_PATTERN.test(cfg.id)) err('id', 'Mã flow không hợp lệ');
  if (!cfg.name) err('name', 'Thiếu tên flow');
  for (const k of ['inputs', 'runParams', 'costItems', 'checks'] as const)
    if (!Array.isArray(cfg[k])) {
      err(k, 'Phải là danh sách');
      return errs;
    }
  if (!cfg.employeeTable || !Array.isArray(cfg.employeeTable.columns)) {
    err('employeeTable', 'Thiếu bảng nhân viên');
    return errs;
  }
  if (!cfg.aggregation) {
    err('aggregation', 'Thiếu cấu hình aggregation');
    return errs;
  }
  if (!cfg.forms?.form02 || !cfg.forms?.form03) {
    err('forms', 'Thiếu forms.form02 / forms.form03');
    return errs;
  }

  // inputs
  dupCheck(cfg.inputs.map((i) => i.id), 'inputs', 'Input');
  const inputs: Record<string, string[]> = {};
  cfg.inputs.forEach((inp, i) => {
    const fields = [...(inp.fields ?? []).map((f) => f.id), ...(inp.computed ?? []).map((c) => c.id)];
    dupCheck(fields, `inputs[${i}].fields`, `Field của ${inp.id}`);
    inputs[inp.id] = fields;
    if (!fields.includes(inp.key)) err(`inputs[${i}].key`, `Input "${inp.id}": field khoá "${inp.key}" không tồn tại`);
    (inp.fields ?? []).forEach((f, j) => {
      if (!['text', 'number', 'date'].includes(f.type)) err(`inputs[${i}].fields[${j}]`, `Kiểu "${f.type}" không hợp lệ`);
    });
  });

  // run params
  dupCheck(cfg.runParams.map((p) => p.id), 'runParams', 'Tham số');
  cfg.runParams.forEach((p, i) => {
    if (RESERVED_RUN.includes(p.id)) err(`runParams[${i}]`, `"${p.id}" là tham số có sẵn, không khai báo lại`);
    if (!['text', 'number', 'date', 'master', 'costItem'].includes(p.type)) err(`runParams[${i}]`, `Kiểu "${p.type}" không hợp lệ`);
    if (p.type === 'master' && vctx.tables && !(p.table && vctx.tables[p.table]))
      err(`runParams[${i}]`, `Tham số "${p.id}": không có bảng master "${p.table ?? ''}"`);
  });
  const run = [...RESERVED_RUN, ...cfg.runParams.map((p) => p.id)];

  const at = (site: FormulaSite): ScopeInfo => scopeFor(cfg, vctx, site);
  const checkTemplate = (path: string, text: string | undefined) => {
    if (!text) return;
    for (const m of text.matchAll(/\{=([^{}]*)\}/g)) for (const e of analyzeFormula(m[1], at({ kind: 'template' })).errors) err(path, `{=${m[1]}}: ${e}`);
  };
  const check = (path: string, formula: string | null | undefined, info: ScopeInfo, required = true) => {
    if (formula === null || formula === undefined || !String(formula).trim()) {
      if (required) err(path, 'Thiếu công thức');
      return;
    }
    for (const m of analyzeFormula(String(formula), info).errors) err(path, m);
  };

  // computed input fields
  cfg.inputs.forEach((inp, i) =>
    (inp.computed ?? []).forEach((c, j) => {
      if (!['number', 'text'].includes(c.type)) err(`inputs[${i}].computed[${j}]`, 'Kiểu phải là number / text');
      check(`inputs[${i}].computed[${j}] (${c.id})`, c.formula, at({ kind: 'inputComputed' }));
    }),
  );

  // employee table
  const et = cfg.employeeTable;
  if (!inputs[et.source]) err('employeeTable.source', `Input nguồn "${et.source}" không tồn tại`);
  const empCols = et.columns.map((c) => c.id);
  dupCheck(empCols, 'employeeTable.columns', 'Cột');
  et.columns.forEach((c, i) => {
    check(`employeeTable.columns[${i}] (${c.id})`, c.formula, at({ kind: 'employeeColumn', index: i }));
  });
  check('employeeTable.rowFilter', et.rowFilter, at({ kind: 'employeeFilter' }), false);

  // cost items
  const seen = new Set<string>();
  cfg.costItems.forEach((c, i) => {
    const p = `costItems[${i}] (${c.helper})`;
    if (!c.helper) err(p, 'Thiếu Helper');
    if (seen.has(c.helper.toUpperCase())) err(p, `Helper "${c.helper}" bị trùng`);
    seen.add(c.helper.toUpperCase());
    if (!c.costCode) err(p, 'Thiếu Cost Code');
    if (!['M', 'Q', 'H', 'Y'].includes(c.periodType)) err(p, 'Loại kỳ phải là M/Q/H/Y');
    if (!c.budget) err(p, 'Thiếu Budget');
    if (c.amount && !empCols.includes(c.amount)) err(p, `Cột số tiền "${c.amount}" không có trong bảng nhân viên`);
    check(p, c.unitFilter, at({ kind: 'unitFilter' }), false);
    for (const k of ['employeeAmount', 'helperColumn', 'costCenterColumn'] as const) {
      const v = c[k];
      if (v && !empCols.includes(v)) err(p, `${k}: cột "${v}" không có trong bảng nhân viên`);
    }
  });

  // aggregation
  const agg = cfg.aggregation;
  if (!empCols.includes(agg.unitColumn)) err('aggregation.unitColumn', `Cột đơn vị "${agg.unitColumn}" không có trong bảng nhân viên`);
  if (vctx.tables) {
    const cc = vctx.tables[agg.costCenterTable];
    if (!cc) err('aggregation.costCenterTable', `Không có bảng master "${agg.costCenterTable}"`);
    else
      for (const k of ['deptColumn', 'costCenterColumn', 'sectorColumn'] as const)
        if (!cc.includes(agg[k])) err(`aggregation.${k}`, `Bảng "${agg.costCenterTable}" không có cột "${agg[k]}"`);
  }
  // extra unit-table fields and group keys: valid, unique ids that do not hide a built-in row field
  const extraIds = new Set<string>();
  const extra = (list: 'unitFields' | 'groupBy', from: 'unit' | 'emp') =>
    (agg[list] ?? []).forEach((f, i) => {
      const p = `aggregation.${list}[${i}] (${f.id})`;
      if (!f.id || !ID_PATTERN.test(f.id)) err(p, `Mã "${f.id}": chỉ gồm chữ không dấu, số, "_" và không bắt đầu bằng số`);
      else if ((ROW_FIELDS as readonly string[]).includes(f.id)) err(p, `Mã "${f.id}" trùng field có sẵn row.${f.id} — đặt mã khác`);
      else if (extraIds.has(f.id)) err(p, `Mã "${f.id}" bị trùng`);
      extraIds.add(f.id);
      if (!f.column) err(p, 'Chưa chọn cột');
      else if (from === 'emp' && !empCols.includes(f.column)) err(p, `Cột "${f.column}" không có trong bảng nhân viên`);
      else if (from === 'unit' && vctx.tables?.[agg.costCenterTable] && !vctx.tables[agg.costCenterTable].includes(f.column))
        err(p, `Bảng "${agg.costCenterTable}" không có cột "${f.column}"`);
    });
  extra('unitFields', 'unit');
  extra('groupBy', 'emp');
  check('aggregation.unitFilter', agg.unitFilter, at({ kind: 'unitFilter' }), false);
  if (!agg.descriptionTemplate) err('aggregation.descriptionTemplate', 'Thiếu mẫu diễn giải');

  // forms
  const checkForm = (id: 'form02' | 'form03', f: FormDef) => {
    const cols = (f.columns ?? []).map((c) => c.id);
    if (!f.enabled) return;
    dupCheck(cols, `forms.${id}.columns`, 'Cột');
    check(`forms.${id}.rowFilter`, f.rowFilter, at({ kind: 'formRowFilter', form: id }), false);
    f.columns.forEach((c, i) => check(`forms.${id}.columns[${i}] (${c.id})`, c.formula, at({ kind: 'formColumn', form: id, index: i })));
    if (f.phase !== undefined && f.phase !== 'accrual' && f.phase !== 'payment') err(`forms.${id}.phase`, 'Đợt chạy của form phải là accrual (trích) hoặc payment (chi)');
    const feed = f.ledgerFeed;
    if (!feed || !['accrual', 'actual', 'both', 'none'].includes(feed.sheet)) err(`forms.${id}.ledgerFeed`, 'ledgerFeed.sheet phải là accrual / actual / both / none');
    else if (feed.sheet !== 'none') {
      const col = f.columns.find((c) => c.id === feed.amountColumn);
      if (!col) err(`forms.${id}.ledgerFeed`, `Cột ghi vào ledger "${feed.amountColumn}" không có trong ${id}`);
      else if (col.type !== 'number') err(`forms.${id}.ledgerFeed`, `Cột ghi vào ledger "${feed.amountColumn}" phải là số`);
      else if (f.adjust && (feed.sheet === 'accrual' || feed.sheet === 'both')) {
        // the ledger takes "accrual this period"; the engine adds the adjustment itself
        // (actual accrual = accrual + adjusted). A column that already includes it would count it twice.
        const withAdj = new Set<string>();
        for (const c of f.columns ?? [])
          if (/\brow\.(adjusted|actualAccrual)\b/i.test(c.formula ?? '') || [...(c.formula ?? '').matchAll(/\[([^\]]+)\]/g)].some((m) => withAdj.has(m[1].trim())))
            withAdj.add(c.id);
        if (withAdj.has(col.id))
          err(
            `forms.${id}.ledgerFeed`,
            `Cột ghi vào ledger "${col.id}" đã gồm số điều chỉnh kỳ trước — điều chỉnh sẽ bị cộng 2 lần. Chọn cột "số trích kỳ này" (chưa điều chỉnh).`,
          );
      }
    }
    if (!f.layout?.sheetName) err(`forms.${id}.layout`, 'Thiếu tên sheet');
    const L = f.layout;
    const roles = [...(L?.signatures ?? []), ...(L?.footer ?? []).flatMap((b) => (b.kind === 'signatures' ? b.roles : []))];
    roles.forEach((s) => {
      if (s.nameParam && !run.includes(s.nameParam)) err(`forms.${id}.layout`, `Chữ ký "${s.title}": tham số "${s.nameParam}" không tồn tại`);
    });
    const texts = [
      L?.companyName,
      L?.titleVi,
      L?.titleEn,
      L?.placeDate,
      ...(L?.preLines ?? []),
      ...(L?.extraLines ?? []),
      ...(L?.footer ?? []).flatMap((b) => (b.kind === 'text' ? b.lines : [])),
      ...roles.flatMap((r) => [r.title, r.titleEn]),
    ];
    for (const t of texts) checkTemplate(`forms.${id}.layout`, t);
  };
  checkForm('form02', cfg.forms.form02);
  checkForm('form03', cfg.forms.form03);

  // checks
  dupCheck(cfg.checks.map((c) => c.id), 'checks', 'Kiểm tra');
  cfg.checks.forEach((c, i) => {
    const p = `checks[${i}] (${c.id})`;
    if (!['error', 'warning'].includes(c.level)) err(p, 'Mức phải là error / warning');
    if (!c.message) err(p, 'Thiếu thông báo');
    if (!['employee', 'form02', 'form03', 'total'].includes(c.scope)) err(p, 'Phạm vi phải là employee / form02 / form03 / total');
    else check(p, c.formula, at({ kind: 'check', scope: c.scope }));
  });

  // extra sheets
  (cfg.extraSheets ?? []).forEach((s, i) =>
    s.rows.forEach((r, ri) =>
      r.cells.forEach((cell, ci) => check(`extraSheets[${i}] (${s.name}) dòng ${ri + 1} cột ${ci + 1}`, cell, at({ kind: 'extraCell' }), false)),
    ),
  );

  if (!cfg.fileName) err('fileName', 'Thiếu mẫu tên file');
  else checkTemplate('fileName', cfg.fileName);
  return errs;
}
