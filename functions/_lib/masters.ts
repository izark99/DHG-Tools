// Master tables are effective-dated: every save adds a version (see src/engine/effective.ts).
import { currentPeriod, effectiveAt, PERIOD, timeline, type VersionMeta } from '../../src/engine/effective';
import type { MasterTable, Scalar } from '../../src/engine/types';
import { HttpError } from './http';

export const TABLE_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const MAX_JSON = 1_800_000; // D1 value limit is ~2 MB

export interface MasterMetaRow {
  id: number;
  name: string;
  version: number;
  effective_from: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
  cancelled_at: string | null;
  cancelled_by: string | null;
}
interface MasterDataRow extends MasterMetaRow {
  columns_json: string;
  rows_json: string;
}

export interface MasterVersionInfo {
  version: number;
  effective_from: string;
  effective_to: string | null;
  state: string;
  note: string | null;
  by: string | null;
  at: string;
  cancelled_by: string | null;
  cancelled_at: string | null;
}

export type MasterAt = MasterTable & { version: number; effective_from: string; effective_to: string | null; note: string | null; by: string | null; at: string };

const META = 'id, name, version, effective_from, note, created_by, created_at, cancelled_at, cancelled_by';
const meta = (r: MasterMetaRow): VersionMeta & { row: MasterMetaRow } => ({ version: r.version, effectiveFrom: r.effective_from, cancelled: !!r.cancelled_at, row: r });

const isScalar = (v: unknown): v is Scalar => v === null || ['string', 'number', 'boolean'].includes(typeof v);

/** Validate and normalise a table coming from the client. */
export function cleanTable(name: string, input: unknown): { columns: string[]; rows: Scalar[][] } {
  if (!TABLE_NAME.test(name)) throw new HttpError(400, 'Tên bảng: chữ cái đầu, chỉ gồm A-Z a-z 0-9 _');
  const t = input as { columns?: unknown; rows?: unknown };
  if (!Array.isArray(t?.columns) || !t.columns.length) throw new HttpError(400, 'Bảng phải có ít nhất 1 cột');
  const columns = t.columns.map((c) => String(c ?? '').trim());
  if (columns.some((c) => !c || c.length > 100)) throw new HttpError(400, 'Tên cột trống hoặc quá dài');
  if (new Set(columns.map((c) => c.toLowerCase())).size !== columns.length) throw new HttpError(400, 'Tên cột bị trùng');
  if (!Array.isArray(t.rows)) throw new HttpError(400, 'rows phải là danh sách');
  const rows = t.rows.map((r) => {
    if (!Array.isArray(r)) throw new HttpError(400, 'Mỗi dòng phải là danh sách');
    const out = columns.map((_, i) => (r[i] === undefined ? null : r[i]));
    if (!out.every(isScalar)) throw new HttpError(400, 'Ô chỉ được là chữ / số / TRUE-FALSE / trống');
    return out as Scalar[];
  });
  if (JSON.stringify(rows).length > MAX_JSON) throw new HttpError(413, 'Bảng quá lớn');
  return { columns, rows };
}

export function cleanPeriod(p: unknown, what = 'Kỳ hiệu lực'): string {
  if (typeof p !== 'string' || !PERIOD.test(p)) throw new HttpError(400, `${what} phải có dạng YYYY-MM`);
  return p;
}

export function cleanNote(n: unknown): string | null {
  if (n === undefined || n === null || n === '') return null;
  if (typeof n !== 'string') throw new HttpError(400, 'Ghi chú phải là chữ');
  return n.trim().slice(0, 500) || null;
}

async function allMeta(db: D1Database, name?: string): Promise<MasterMetaRow[]> {
  const q = name
    ? db.prepare(`SELECT ${META} FROM master_versions WHERE name = ? ORDER BY version`).bind(name)
    : db.prepare(`SELECT ${META} FROM master_versions ORDER BY name, version`);
  return (await q.all<MasterMetaRow>()).results;
}

function group(rows: MasterMetaRow[]): Map<string, MasterMetaRow[]> {
  const m = new Map<string, MasterMetaRow[]>();
  for (const r of rows) m.set(r.name, [...(m.get(r.name) ?? []), r]);
  return m;
}

/** Version list of one table with effective ranges, newest first. */
export function versionInfo(rows: MasterMetaRow[], today = currentPeriod()): MasterVersionInfo[] {
  return timeline(rows.map(meta), today).map((s) => ({
    version: s.item.version,
    effective_from: s.from,
    effective_to: s.to,
    state: s.state,
    note: s.item.row.note,
    by: s.item.row.created_by,
    at: s.item.row.created_at,
    cancelled_by: s.item.row.cancelled_by,
    cancelled_at: s.item.row.cancelled_at,
  }));
}

/** Every table with its version list (no rows). */
export async function catalog(db: D1Database, today = currentPeriod()): Promise<{ name: string; versions: MasterVersionInfo[] }[]> {
  return [...group(await allMeta(db)).entries()].map(([name, rows]) => ({ name, versions: versionInfo(rows, today) }));
}

/** The tables that apply to a payroll period (a table with no version for the period is left out). */
export async function mastersAt(db: D1Database, period = currentPeriod()): Promise<MasterAt[]> {
  const out: MasterAt[] = [];
  const picks: { id: number; to: string | null }[] = [];
  for (const rows of group(await allMeta(db)).values()) {
    const v = effectiveAt(rows.map(meta), period);
    if (!v) continue;
    const span = timeline(rows.map(meta), period).find((s) => s.item.row.id === v.row.id);
    picks.push({ id: v.row.id, to: span?.to ?? null });
  }
  for (let i = 0; i < picks.length; i += 50) {
    const chunk = picks.slice(i, i + 50);
    const { results } = await db
      .prepare(`SELECT * FROM master_versions WHERE id IN (${chunk.map(() => '?').join(',')})`)
      .bind(...chunk.map((p) => p.id))
      .all<MasterDataRow>();
    for (const r of results)
      out.push({
        name: r.name,
        columns: JSON.parse(r.columns_json),
        rows: JSON.parse(r.rows_json),
        version: r.version,
        effective_from: r.effective_from,
        effective_to: chunk.find((p) => p.id === r.id)?.to ?? null,
        note: r.note,
        by: r.created_by,
        at: r.created_at,
      });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Tables in force now (used to validate a flow when it is published). */
export async function allMasters(db: D1Database): Promise<MasterTable[]> {
  return mastersAt(db, currentPeriod());
}

export async function masterVersion(db: D1Database, name: string, version: number) {
  return db.prepare('SELECT * FROM master_versions WHERE name = ? AND version = ?').bind(name, version).first<MasterDataRow>();
}

/** Statement that appends a version (version number = max + 1 at execution time). */
export function insertMasterVersion(
  db: D1Database,
  name: string,
  t: { columns: string[]; rows: Scalar[][] },
  effectiveFrom: string,
  note: string | null,
  by: string,
  at: string,
  cancelled: { at: string; by: string } | null = null,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO master_versions (name, version, effective_from, columns_json, rows_json, note, created_by, created_at, cancelled_at, cancelled_by)
       VALUES (?, (SELECT COALESCE(MAX(version), 0) + 1 FROM master_versions WHERE name = ?), ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(name, name, effectiveFrom, JSON.stringify(t.columns), JSON.stringify(t.rows), note, by, at, cancelled?.at ?? null, cancelled?.by ?? null);
}

export async function tableVersions(db: D1Database, name: string): Promise<MasterVersionInfo[]> {
  return versionInfo(await allMeta(db, name));
}
