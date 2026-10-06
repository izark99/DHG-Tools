// Admin: export / import the whole configuration (flows + master tables) as one JSON file.
// Import replaces master tables with the same name and loads each flow's config as a DRAFT
// (the admin reviews and publishes it); no published version is changed.
import { body, error, json, now, requireAdmin, route, type Handler } from '../_lib/http';
import { cleanConfig, FLOW_ID } from '../_lib/flows';
import { allMasters, cleanTable } from '../_lib/masters';

export const onRequestGet: Handler = route(async ({ env, data }) => {
  requireAdmin(data);
  const { results: flows } = await env.DB.prepare('SELECT id, name, sort, active FROM flows ORDER BY sort, id').all<{
    id: string;
    name: string;
    sort: number;
    active: number;
  }>();
  const { results: versions } = await env.DB.prepare(
    'SELECT flow_id, version, status, config_json, created_by, created_at FROM flow_versions ORDER BY flow_id, version',
  ).all<{ flow_id: string; version: number; status: string; config_json: string; created_by: string; created_at: string }>();
  return json({
    kind: 'cb-forms-backup',
    exportedAt: now(),
    flows: flows.map((f) => ({
      ...f,
      active: !!f.active,
      versions: versions
        .filter((v) => v.flow_id === f.id)
        .map((v) => ({ version: v.version, status: v.status, created_by: v.created_by, created_at: v.created_at, config: JSON.parse(v.config_json) })),
    })),
    masters: (await allMasters(env.DB)).map((t) => ({ name: t.name, columns: t.columns, rows: t.rows })),
  });
});

interface ImportFlow {
  id: string;
  name: string;
  sort?: number;
  active?: boolean;
  versions?: { version: number; status: string; config: unknown }[];
  config?: unknown;
}

export const onRequestPost: Handler = route(async ({ request, env, data }) => {
  const me = requireAdmin(data);
  const b = await body<{ kind?: string; flows?: ImportFlow[]; masters?: { name: string; columns: unknown; rows: unknown }[] }>(request, 20_000_000);
  if (b.kind !== 'cb-forms-backup') return error(400, 'Không phải file backup của ứng dụng');
  const stmts: D1PreparedStatement[] = [];
  const t = now();
  for (const m of b.masters ?? []) {
    const clean = cleanTable(String(m.name), m);
    stmts.push(
      env.DB.prepare(
        `INSERT INTO master_tables (name, columns_json, rows_json, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET columns_json = excluded.columns_json, rows_json = excluded.rows_json,
           updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      ).bind(String(m.name), JSON.stringify(clean.columns), JSON.stringify(clean.rows), me.username, t),
    );
  }
  let flowCount = 0;
  for (const f of b.flows ?? []) {
    if (!FLOW_ID.test(String(f.id))) return error(400, `Mã flow không hợp lệ: ${f.id}`);
    const versions = (f.versions ?? []).slice().sort((a, b2) => (a.status === 'draft' ? 1 : 0) - (b2.status === 'draft' ? 1 : 0) || a.version - b2.version);
    const src = f.config ?? versions.filter((v) => v.status === 'published').pop()?.config ?? versions.pop()?.config;
    if (!src) continue;
    const { json: cfg } = cleanConfig(f.id, src);
    stmts.push(
      env.DB.prepare(
        `INSERT INTO flows (id, name, sort, active) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, sort = excluded.sort, active = excluded.active`,
      ).bind(f.id, String(f.name || f.id).slice(0, 100), Number(f.sort ?? 0), f.active === false ? 0 : 1),
      env.DB.prepare(`DELETE FROM flow_versions WHERE flow_id = ? AND status = 'draft'`).bind(f.id),
      env.DB.prepare(`INSERT INTO flow_versions (flow_id, version, config_json, status, created_by, created_at) VALUES (?, 0, ?, 'draft', ?, ?)`).bind(
        f.id,
        cfg,
        me.username,
        t,
      ),
    );
    flowCount++;
  }
  if (stmts.length) await env.DB.batch(stmts);
  return json({ ok: true, masters: (b.masters ?? []).length, flows: flowCount });
});
