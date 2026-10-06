import { body, error, json, now, requireAdmin, requireUser, route, type Handler } from '../../_lib/http';
import { cleanTable, toTable, type MasterRow } from '../../_lib/masters';

export const onRequestGet: Handler = route(async ({ env, data, params }) => {
  requireUser(data);
  const r = await env.DB.prepare('SELECT * FROM master_tables WHERE name = ?').bind(String(params.name)).first<MasterRow>();
  if (!r) return error(404, 'Không có bảng này');
  return json({ table: toTable(r) });
});

export const onRequestPut: Handler = route(async ({ request, env, data, params }) => {
  const me = requireAdmin(data);
  const name = String(params.name);
  const t = cleanTable(name, await body(request));
  await env.DB.prepare(
    `INSERT INTO master_tables (name, columns_json, rows_json, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET columns_json = excluded.columns_json, rows_json = excluded.rows_json,
       updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
  )
    .bind(name, JSON.stringify(t.columns), JSON.stringify(t.rows), me.username, now())
    .run();
  return json({ ok: true });
});

export const onRequestDelete: Handler = route(async ({ env, data, params }) => {
  requireAdmin(data);
  await env.DB.prepare('DELETE FROM master_tables WHERE name = ?').bind(String(params.name)).run();
  return json({ ok: true });
});
