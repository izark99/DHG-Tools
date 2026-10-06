import { currentPeriod, effectiveAt, timeline } from '../../src/engine/effective';
import type { FlowConfig } from '../../src/engine/types';
import { contextFromMasters, validateConfig, type ConfigError } from '../../src/engine/validate';
import { HttpError } from './http';
import { mastersAt } from './masters';

export const FLOW_ID = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
const MAX_CONFIG = 1_800_000;

export function cleanConfig(flowId: string, input: unknown): { config: FlowConfig; json: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'Config phải là một object JSON');
  const config = { ...(input as FlowConfig), id: flowId };
  const text = JSON.stringify(config);
  if (text.length > MAX_CONFIG) throw new HttpError(413, 'Config quá lớn');
  return { config, json: text };
}

/** Validate against the master tables that apply to `period` (the version's first period). */
export async function validateAgainstMasters(db: D1Database, config: FlowConfig, period = currentPeriod()): Promise<ConfigError[]> {
  const masters = await mastersAt(db, period);
  try {
    return validateConfig(config, contextFromMasters(masters));
  } catch (e) {
    return [{ path: '', message: `Config không đọc được: ${e instanceof Error ? e.message : 'lỗi'}` }];
  }
}

export interface FlowVersionRow {
  id: number;
  version: number;
  effective_from: string;
  note: string | null;
  created_by: string;
  created_at: string;
  cancelled_at: string | null;
  cancelled_by: string | null;
}

export interface FlowVersionInfo {
  version: number;
  effective_from: string;
  effective_to: string | null;
  state: string;
  note: string | null;
  by: string;
  at: string;
  cancelled_by: string | null;
  cancelled_at: string | null;
}

const meta = (r: FlowVersionRow) => ({ version: r.version, effectiveFrom: r.effective_from, cancelled: !!r.cancelled_at, row: r });

/** Published versions of every flow (no config), grouped by flow id. */
export async function publishedMeta(db: D1Database, flowId?: string): Promise<Map<string, FlowVersionRow[]>> {
  const cols = 'id, flow_id, version, effective_from, note, created_by, created_at, cancelled_at, cancelled_by';
  const q = flowId
    ? db.prepare(`SELECT ${cols} FROM flow_versions WHERE status = 'published' AND flow_id = ? ORDER BY version`).bind(flowId)
    : db.prepare(`SELECT ${cols} FROM flow_versions WHERE status = 'published' ORDER BY flow_id, version`);
  const m = new Map<string, FlowVersionRow[]>();
  for (const r of (await q.all<FlowVersionRow & { flow_id: string }>()).results) m.set(r.flow_id, [...(m.get(r.flow_id) ?? []), r]);
  return m;
}

export function flowVersionInfo(rows: FlowVersionRow[], today = currentPeriod()): FlowVersionInfo[] {
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

/** The published version that applies to a payroll period, with its config; null if none. */
export async function effectiveFlow(db: D1Database, flowId: string, period: string) {
  const rows = (await publishedMeta(db, flowId)).get(flowId) ?? [];
  const pick = effectiveAt(rows.map(meta), period);
  if (!pick) return { pick: null, versions: flowVersionInfo(rows) };
  const info = flowVersionInfo(rows, period).find((v) => v.version === pick.version)!;
  const r = await db.prepare('SELECT config_json FROM flow_versions WHERE id = ?').bind(pick.row.id).first<{ config_json: string }>();
  return { pick: { ...info, config: JSON.parse(r!.config_json) as FlowConfig }, versions: flowVersionInfo(rows) };
}
