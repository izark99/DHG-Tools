import { body, error, json, now, requireAdmin, route, type Handler } from '../../../_lib/http';
import { cleanConfig, validateAgainstMasters } from '../../../_lib/flows';

// PUT {config} → save draft (errors are returned, not blocking: a draft may be incomplete).
export const onRequestPut: Handler = route(async ({ request, env, data, params }) => {
  const me = requireAdmin(data);
  const id = String(params.id);
  if (!(await env.DB.prepare('SELECT 1 FROM flows WHERE id = ?').bind(id).first())) return error(404, 'Không có flow này');
  const b = await body<{ config?: unknown }>(request);
  const { config, json: cfg } = cleanConfig(id, b.config);
  const existing = await env.DB.prepare(`SELECT id FROM flow_versions WHERE flow_id = ? AND status = 'draft'`).bind(id).first<{ id: number }>();
  if (existing)
    await env.DB.prepare('UPDATE flow_versions SET config_json = ?, created_by = ?, created_at = ? WHERE id = ?')
      .bind(cfg, me.username, now(), existing.id)
      .run();
  else
    await env.DB.prepare(`INSERT INTO flow_versions (flow_id, version, config_json, status, created_by, created_at) VALUES (?, 0, ?, 'draft', ?, ?)`)
      .bind(id, cfg, me.username, now())
      .run();
  return json({ ok: true, errors: await validateAgainstMasters(env.DB, config) });
});

export const onRequestDelete: Handler = route(async ({ env, data, params }) => {
  requireAdmin(data);
  await env.DB.prepare(`DELETE FROM flow_versions WHERE flow_id = ? AND status = 'draft'`).bind(String(params.id)).run();
  return json({ ok: true });
});
