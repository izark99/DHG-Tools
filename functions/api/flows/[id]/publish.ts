// POST {fromVersion?} → publish the draft (default) or re-publish an older version as a new version.
// Old versions are never edited. A config with formula errors cannot be published.
import { body, error, json, now, requireAdmin, route, type Handler } from '../../../_lib/http';
import { cleanConfig, validateAgainstMasters } from '../../../_lib/flows';

export const onRequestPost: Handler = route(async ({ request, env, data, params }) => {
  const me = requireAdmin(data);
  const id = String(params.id);
  const b = await body<{ fromVersion?: unknown }>(request, 10_000);
  const src =
    typeof b.fromVersion === 'number'
      ? await env.DB.prepare(`SELECT config_json FROM flow_versions WHERE flow_id = ? AND status = 'published' AND version = ?`)
          .bind(id, b.fromVersion)
          .first<{ config_json: string }>()
      : await env.DB.prepare(`SELECT config_json FROM flow_versions WHERE flow_id = ? AND status = 'draft'`).bind(id).first<{ config_json: string }>();
  if (!src) return error(404, typeof b.fromVersion === 'number' ? 'Không có phiên bản này' : 'Không có bản nháp');
  const { config, json: cfg } = cleanConfig(id, JSON.parse(src.config_json));
  const errors = await validateAgainstMasters(env.DB, config);
  if (errors.length) return json({ error: 'Config còn lỗi, chưa thể publish', errors }, 400);
  const max = await env.DB.prepare(`SELECT COALESCE(MAX(version), 0) AS m FROM flow_versions WHERE flow_id = ? AND status = 'published'`)
    .bind(id)
    .first<{ m: number }>();
  const version = (max?.m ?? 0) + 1;
  const stmts = [
    env.DB.prepare(`INSERT INTO flow_versions (flow_id, version, config_json, status, created_by, created_at) VALUES (?, ?, ?, 'published', ?, ?)`).bind(
      id,
      version,
      cfg,
      me.username,
      now(),
    ),
    env.DB.prepare('UPDATE flows SET name = ? WHERE id = ?').bind(String(config.name || id).slice(0, 100), id),
  ];
  if (typeof b.fromVersion !== 'number') stmts.push(env.DB.prepare(`DELETE FROM flow_versions WHERE flow_id = ? AND status = 'draft'`).bind(id));
  await env.DB.batch(stmts);
  return json({ ok: true, version });
});
