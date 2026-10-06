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
}

export interface RunParamDef {
  id: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'master';
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
  /** Employee-table column with the amount. */
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
  width?: number;
}

export interface SignatureRole {
  title: string;
  titleEn?: string;
  /** Run parameter holding the signer's name (optional). */
  nameParam?: string;
}

export interface FormLayout {
  sheetName: string;
  companyName: string;
  /** Templates: {MM} {M} {YYYY} {Q} {H} and {<run param id>} */
  titleVi: string;
  titleEn: string;
  extraLines?: string[];
  placeDate?: string;
  signatures: SignatureRole[];
}

export type LedgerSheet = 'accrual' | 'actual' | 'none';

export interface FormDef {
  enabled: boolean;
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
