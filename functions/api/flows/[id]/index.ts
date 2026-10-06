import { body, error, json, requireAdmin, requireUser, route, type Handler } from '../../../_lib/http';

// GET → flow metadata + version list (+ draft config for admin).
export const onRequestGet: Handler = route(async ({ env, data, params }) => {
  const me = requireUser(data);
  const id = String(params.id);
  const flow = await env.DB.prepare('SELECT id, name, sort, active FROM flows WHERE id = ?').bind(id).first<{ active: number }>();
  if (!flow || (!flow.active && me.role !== 'admin')) return error(404, 'Không có flow này');
  const { results } = await env.DB.prepare(
    `SELECT version, status, created_by, created_at FROM flow_versions WHERE flow_id = ? ORDER BY status = 'draft' DESC, version DESC`,
  )
    .bind(id)
    .all<{ version: number; status: string }>();
  let draft = null;
  if (me.role === 'admin') {
    const d = await env.DB.prepare(`SELECT config_json, created_by, created_at FROM flow_versions WHERE flow_id = ? AND status = 'draft'`)
      .bind(id)
      .first<{ config_json: string; created_by: string; created_at: string }>();
    if (d) draft = { config: JSON.parse(d.config_json), by: d.created_by, at: d.created_at };
  }
  return json({ flow: { ...flow, active: !!flow.active }, versions: results.filter((v) => v.status === 'published'), draft });
});

// PATCH {name?, sort?, active?} (admin)
export const onRequestPatch: Handler = route(async ({ request, env, data, params }) => {
  requireAdmin(data);
  const id = String(params.id);
  const b = await body<{ name?: unknown; sort?: unknown; active?: unknown }>(request, 10_000);
  if (!(await env.DB.prepare('SELECT 1 FROM flows WHERE id = ?').bind(id).first())) return error(404, 'Không có flow này');
  if (typeof b.name === 'string' && b.name.trim())
    await env.DB.prepare('UPDATE flows SET name = ? WHERE id = ?').bind(b.name.trim().slice(0, 100), id).run();
  if (typeof b.sort === 'number' && Number.isFinite(b.sort)) await env.DB.prepare('UPDATE flows SET sort = ? WHERE id = ?').bind(Math.trunc(b.sort), id).run();
  if (typeof b.active === 'boolean') await env.DB.prepare('UPDATE flows SET active = ? WHERE id = ?').bind(b.active ? 1 : 0, id).run();
  return json({ ok: true });
});
