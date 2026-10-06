import { error, json, requireUser, route, type Handler } from '../../../../_lib/http';

export const onRequestGet: Handler = route(async ({ env, data, params }) => {
  const me = requireUser(data);
  const id = String(params.id);
  const flow = await env.DB.prepare('SELECT active FROM flows WHERE id = ?').bind(id).first<{ active: number }>();
  if (!flow || (!flow.active && me.role !== 'admin')) return error(404, 'Không có flow này');
  const v = await env.DB.prepare(
    `SELECT version, config_json, created_by, created_at FROM flow_versions WHERE flow_id = ? AND status = 'published' AND version = ?`,
  )
    .bind(id, Number(params.version))
    .first<{ version: number; config_json: string; created_by: string; created_at: string }>();
  if (!v) return error(404, 'Không có phiên bản này');
  return json({ version: v.version, by: v.created_by, at: v.created_at, config: JSON.parse(v.config_json) });
});
