// What each formula in a flow may reference. Shared by validation and the editor's autocomplete.
import type { ScopeInfo } from './formula/analyze';
import { ROW_FIELDS, UNIT_FIELDS, type CheckDef, type FlowConfig } from './types';
import type { ValidationContext } from './validate';

export const RESERVED_RUN = ['month', 'year'];

export type FormulaSite =
  | { kind: 'employeeColumn'; index: number }
  | { kind: 'employeeFilter' }
  | { kind: 'unitFilter' }
  | { kind: 'formRowFilter'; form: 'form02' | 'form03' }
  | { kind: 'formColumn'; form: 'form02' | 'form03'; index: number }
  | { kind: 'check'; scope: CheckDef['scope'] }
  | { kind: 'extraCell' }
  | { kind: 'inputComputed' }
  | { kind: 'template' };

export function scopeFor(cfg: FlowConfig, vctx: ValidationContext, site: FormulaSite): ScopeInfo {
  const inputs: Record<string, string[]> = {};
  for (const i of cfg.inputs ?? []) inputs[i.id] = [...(i.fields ?? []).map((f) => f.id), ...(i.computed ?? []).map((c) => c.id)];
  const run = [...RESERVED_RUN, ...(cfg.runParams ?? []).map((p) => p.id)];
  const base = { inputs, params: vctx.params, run, tables: vctx.tables };
  const empCols = (cfg.employeeTable?.columns ?? []).map((c) => c.id);
  const formCols = (f: 'form02' | 'form03') => (cfg.forms?.[f]?.columns ?? []).map((c) => c.id);
  const rowInfo = { ...base, rowFields: [...ROW_FIELDS], empColumns: empCols };
  const totalInfo = (): ScopeInfo => ({ ...base, scope: 'total', columns: [], empColumns: empCols, formColumns: { f02: formCols('form02'), f03: formCols('form03') } });

  switch (site.kind) {
    case 'employeeColumn':
      return { ...base, scope: 'employee', columns: empCols.slice(0, site.index), allColumns: empCols };
    case 'employeeFilter':
      return { ...base, scope: 'employee', columns: empCols, allColumns: empCols };
    case 'unitFilter':
      return { ...base, scope: 'unit', columns: [], rowFields: [...UNIT_FIELDS] };
    case 'formRowFilter':
      return { ...rowInfo, scope: 'form', columns: [] };
    case 'formColumn': {
      const cols = formCols(site.form);
      return { ...rowInfo, scope: 'form', columns: cols.slice(0, site.index), allColumns: cols };
    }
    case 'check':
      if (site.scope === 'employee') return { ...base, scope: 'employee', columns: empCols, allColumns: empCols };
      if (site.scope === 'total') return totalInfo();
      return { ...rowInfo, scope: 'form', columns: formCols(site.scope) };
    case 'extraCell':
    case 'template':
      return totalInfo();
    case 'inputComputed':
      return { ...base, scope: 'employee', columns: [] };
  }
}
