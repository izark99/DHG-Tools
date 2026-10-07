// Flow configuration model (PLAN §5). One JSON document per flow version.
import type { Scalar } from './formula/evaluator';

export type { Scalar };

export type FieldType = 'text' | 'number' | 'date';

export interface InputField {
  id: string;
  label?: string;
  type: FieldType;
  required?: boolean;
  aliases: string[];
}

export interface InputDef {
  id: string;
  label: string;
  required: boolean;
  /** Field id holding the employee code. */
  key: string;
  /** Preferred sheet name; empty = the sheet whose headers match best. */
  sheet?: string;
  fields: InputField[];
  /**
   * Per-row computed fields (evaluated in order on every row of this input).
   * `in.<thisInput>.<field>` is the current row; other inputs give the first row of the same employee.
   */
  computed?: { id: string; label?: string; formula: string; type: 'number' | 'text' }[];
}

export interface RunParamDef {
  id: string;
  label: string;
  /** master: pick a row of `table` (value = key column); costItem: pick a cost item of this flow (value = helper). */
  type: 'text' | 'number' | 'date' | 'master' | 'costItem';
  required?: boolean;
  /** For type "master": table to pick a row from (value = key column). */
  table?: string;
  default?: string;
}

export interface EmployeeColumn {
  id: string;
  label: string;
  formula: string;
  type: 'number' | 'text';
  show?: boolean;
}

export interface EmployeeTableDef {
  source: string;
  rowFilter?: string | null;
  columns: EmployeeColumn[];
}

export type PeriodType = 'M' | 'Q' | 'H' | 'Y';

export interface CostItem {
  helper: string;
  costCode: string;
  nameVi: string;
  nameEn?: string;
  periodType: PeriodType;
  /** A column of the CostCenter table (looked up per unit) or a literal budget code. */
  budget: string;
  /**
   * Employee-table column with the amount. Blank = catalogue entry: not summed on its own, used when
   * another item's `helperColumn` sends an amount to this helper (name, cost code, budget, period come from here).
   */
  amount: string;
  /** Employee-table column with the employee-side amount (IN), optional. */
  employeeAmount?: string | null;
  accrue: boolean;
  pay: boolean;
  /** Optional employee column whose non-blank value overrides the Helper. */
  helperColumn?: string | null;
  /**
   * Optional formula in unit scope (row.unit, CC("col") …): the units this cost item applies to.
   * Replaces the workbooks' Cost Code × Unit join on "Key". Amounts on other units are left out
   * of the forms and reported as a warning (Excel drops them silently).
   */
  unitFilter?: string | null;
  /** Optional employee column whose non-blank value overrides the Cost Center. */
  costCenterColumn?: string | null;
}

export interface AggregationDef {
  /** Employee-table column holding the unit code. */
  unitColumn: string;
  /** Master table with one row per unit; its first column is the unit code. */
  costCenterTable: string;
  deptColumn: string;
  costCenterColumn: string;
  sectorColumn: string;
  /** Formula in unit scope (row.unit, row.dept, CC("col") …); FALSE = unit excluded from this flow. */
  unitFilter?: string | null;
  /** Placeholders: {prefix} {name} {nameEn} {period} {dept} {unit} {costCenter} {costCode} {helper} {budgetCode} {sector} */
  descriptionTemplate: string;
}

export interface FormColumn {
  id: string;
  headerVi: string;
  headerEn: string;
  formula: string;
  type: 'number' | 'text';
  /** Include in the Total row (number columns; default true). */
  total?: boolean;
  hideIfZeroTotal?: boolean;
  /** Working column: computed (usable by later columns and checks) but never printed. */
  hidden?: boolean;
  width?: number;
}

export interface SignatureRole {
  title: string;
  titleEn?: string;
  /** Run parameter holding the signer's name (optional). */
  nameParam?: string;
  /** Fixed name when there is no run parameter (optional). */
  name?: string;
}

export type FooterBlock =
  | { kind: 'text'; lines: string[]; align?: 'left' | 'right' }
  | { kind: 'signatures'; roles: SignatureRole[] };

export interface FormLayout {
  sheetName: string;
  companyName: string;
  /**
   * Text templates: {MM} {M} {YYYY} {Q} {QQ} {H} {FLOW} {<run param id>} and {=formula}
   * (a formula in total scope, e.g. {=UPPER(ITEM(run.cost,"nameVi"))}).
   */
  titleVi: string;
  titleEn: string;
  /** Lines between the company name and the title (e.g. "Đơn vị: {group}"). */
  preLines?: string[];
  /** Lines after the title. */
  extraLines?: string[];
  placeDate?: string;
  signatures: SignatureRole[];
  /** Blocks under the first signature row: review text, further signature rows. */
  footer?: FooterBlock[];
  orientation?: 'portrait' | 'landscape';
  /** Total row above the header rows (top) or under the data (bottom, default). */
  totalPosition?: 'top' | 'bottom';
  totalLabel?: string;
}

/** "both": the amount goes to the accrual sheet AND, the same amount, to the actual sheet (actual = accrual). */
export type LedgerSheet = 'accrual' | 'actual' | 'both' | 'none';

/** Run stage a form belongs to: "accrual" (trích, Form 02 by default) or "payment" (chi, Form 03 by default). */
export type FormPhase = 'accrual' | 'payment';
/** What one run produces: accrual forms, payment forms, or both at once. */
export type RunMode = 'accrual' | 'payment' | 'both';

export interface FormDef {
  enabled: boolean;
  /** Run stage; default form02 = accrual, form03 = payment. */
  phase?: FormPhase;
  /** Description prefix, e.g. "Trích" / "Chi". */
  prefix: string;
  /** Formula over the aggregated row (row.*); FALSE = row not on this form. */
  rowFilter?: string | null;
  adjust: boolean;
  ledgerFeed: { sheet: LedgerSheet; amountColumn: string };
  columns: FormColumn[];
  layout: FormLayout;
}

export type CheckScope = 'employee' | 'form02' | 'form03' | 'total';

export interface CheckDef {
  id: string;
  level: 'error' | 'warning';
  scope: CheckScope;
  /** TRUE = pass. */
  formula: string;
  message: string;
}

export interface ExtraSheetDef {
  id: string;
  name: string;
  title?: string;
  columns: { header: string; width?: number; type?: 'number' | 'text' }[];
  /** Each cell is a formula in total scope (blank = empty cell). */
  rows: { cells: string[] }[];
}

export interface FlowConfig {
  schemaVersion: 1;
  id: string;
  name: string;
  /** Ledger name for the hash check (one shared ledger by default). */
  ledger?: string;
  /** Output workbook file name template, e.g. "Form_SL_T{MM}.{YYYY}.xlsx". */
  fileName: string;
  inputs: InputDef[];
  runParams: RunParamDef[];
  employeeTable: EmployeeTableDef;
  costItems: CostItem[];
  aggregation: AggregationDef;
  forms: { form02: FormDef; form03: FormDef };
  checks: CheckDef[];
  extraSheets?: ExtraSheetDef[];
}

/** A master table as stored on the server: first column is the key. */
export interface MasterTable {
  name: string;
  columns: string[];
  rows: Scalar[][];
}

/** Fields of an aggregated row, available as row.<field> in form scope. */
export const ROW_FIELDS = [
  'no',
  'sector',
  'dept',
  'unit',
  'budgetCode',
  'costCenter',
  'costCode',
  'helper',
  'name',
  'nameEn',
  'periodType',
  'period',
  'description',
  'amount',
  'employeeAmount',
  'count',
  'adjusted',
  'actualAccrual',
  'accrue',
  'pay',
] as const;

export const UNIT_FIELDS = ['unit', 'dept', 'costCenter', 'sector'] as const;

export const ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function formPhase(id: 'form02' | 'form03', def: FormDef): FormPhase {
  return def.phase ?? (id === 'form02' ? 'accrual' : 'payment');
}

/** Run modes a flow offers: one per phase of its enabled forms, plus "both" when there are two phases. */
export function runModes(config: FlowConfig): RunMode[] {
  const phases = new Set<FormPhase>();
  if (config.forms.form02.enabled) phases.add(formPhase('form02', config.forms.form02));
  if (config.forms.form03.enabled) phases.add(formPhase('form03', config.forms.form03));
  if (phases.size < 2) return ['both'];
  return ['accrual', 'payment', 'both'];
}

export const RUN_MODE_LABEL: Record<RunMode, string> = { accrual: 'Trích', payment: 'Chi', both: 'Trích + Chi' };
