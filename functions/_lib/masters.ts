import type { MasterTable, Scalar } from '../../src/engine/types';
import { HttpError } from './http';

export const TABLE_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const MAX_JSON = 1_800_000; // D1 value limit is ~2 MB

export interface MasterRow {
  name: string;
  columns_json: string;
  rows_json: string;
  updated_by: string | null;
  updated_at: string | null;
}

export function toTable(r: MasterRow): MasterTable & { updated_by: string | null; updated_at: string | null } {
  return { name: r.name, columns: JSON.parse(r.columns_json), rows: JSON.parse(r.rows_json), updated_by: r.updated_by, updated_at: r.updated_at };
}

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

export async function allMasters(db: D1Database): Promise<MasterTable[]> {
  const { results } = await db.prepare('SELECT * FROM master_tables ORDER BY name').all<MasterRow>();
  return results.map(toTable);
}
