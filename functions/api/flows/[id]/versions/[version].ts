// One published version: read it, or cancel / restore its effect (versions are never deleted).
import { body, error, json, now, requireAdmin, requireUser, route, type Handler } from '../../../../_lib/http';
import { flowVersionInfo, publishedMeta } from '../../../../_lib/flows';

export const onRequestGet: Handler = route(async ({ env, data, params }) => {
  const me = requireUser(data);
  const id = String(params.id);
  const flow = await env.DB.prepare('SELECT active FROM flows WHERE id = ?').bind(id).first<{ active: number }>();
  if (!flow || (!flow.active && me.role !== 'admin')) return error(404, 'Không có flow này');
  const v = await env.DB.prepare(
    `SELECT version, config_json, created_by, created_at, effective_from, note, cancelled_at FROM flow_versions WHERE flow_id = ? AND status = 'published' AND version = ?`,
  )
    .bind(id, Number(params.version))
    .first<{ version: number; config_json: string; created_by: string; created_at: string; effective_from: string; note: string | null; cancelled_at: string | null }>();
  if (!v) return error(404, 'Không có phiên bản này');
  return json({
    version: v.version,
    by: v.created_by,
    at: v.created_at,
    effective_from: v.effective_from,
    note: v.note,
    cancelled: !!v.cancelled_at,
    config: JSON.parse(v.config_json),
  });
});

// POST {action: "cancel" | "restore"} (admin)
export const onRequestPost: Handler = route(async ({ request, env, data, params }) => {
  const me = requireAdmin(data);
  const id = String(params.id);
  const version = Number(params.version);
  const b = await body<{ action?: unknown }>(request, 1_000);
  if (b.action !== 'cancel' && b.action !== 'restore') return error(400, 'action phải là cancel hoặc restore');
  const cancel = b.action === 'cancel';
  const r = await env.DB.prepare(`UPDATE flow_versions SET cancelled_at = ?, cancelled_by = ? WHERE flow_id = ? AND status = 'published' AND version = ?`)
    .bind(cancel ? now() : null, cancel ? me.username : null, id, version)
    .run();
  if (!r.meta.changes) return error(404, 'Không có phiên bản này');
  return json({ ok: true, versions: flowVersionInfo((await publishedMeta(env.DB, id)).get(id) ?? []) });
});
