// POST {effectiveFrom, note?, fromVersion?} → publish the draft (default) or an older version's
// config as a NEW version that applies from payroll period `effectiveFrom`. Old versions are never
// edited or removed; they keep applying to their own periods. A config with formula errors
// (checked against the master tables of that period) cannot be published.
import { body, error, json, now, requireAdmin, route, type Handler } from '../../../_lib/http';
import { cleanConfig, flowVersionInfo, publishedMeta, validateAgainstMasters } from '../../../_lib/flows';
import { cleanNote, cleanPeriod } from '../../../_lib/masters';

export const onRequestPost: Handler = route(async ({ request, env, data, params }) => {
  const me = requireAdmin(data);
  const id = String(params.id);
  const b = await body<{ fromVersion?: unknown; effectiveFrom?: unknown; note?: unknown }>(request, 10_000);
  const from = cleanPeriod(b.effectiveFrom);
  const note = cleanNote(b.note);
  const src =
    typeof b.fromVersion === 'number'
      ? await env.DB.prepare(`SELECT config_json FROM flow_versions WHERE flow_id = ? AND status = 'published' AND version = ?`)
          .bind(id, b.fromVersion)
          .first<{ config_json: string }>()
      : await env.DB.prepare(`SELECT config_json FROM flow_versions WHERE flow_id = ? AND status = 'draft'`).bind(id).first<{ config_json: string }>();
  if (!src) return error(404, typeof b.fromVersion === 'number' ? 'Không có phiên bản này' : 'Không có bản nháp');
  const { config, json: cfg } = cleanConfig(id, JSON.parse(src.config_json));
  const errors = await validateAgainstMasters(env.DB, config, from);
  if (errors.length) return json({ error: `Config còn lỗi (so với master data kỳ ${from}), chưa thể publish`, errors }, 400);
  const max = await env.DB.prepare(`SELECT COALESCE(MAX(version), 0) AS m FROM flow_versions WHERE flow_id = ? AND status = 'published'`)
    .bind(id)
    .first<{ m: number }>();
  const version = (max?.m ?? 0) + 1;
  const stmts = [
    env.DB.prepare(
      `INSERT INTO flow_versions (flow_id, version, config_json, status, created_by, created_at, effective_from, note) VALUES (?, ?, ?, 'published', ?, ?, ?, ?)`,
    ).bind(id, version, cfg, me.username, now(), from, note),
    env.DB.prepare('UPDATE flows SET name = ? WHERE id = ?').bind(String(config.name || id).slice(0, 100), id),
  ];
  if (typeof b.fromVersion !== 'number') stmts.push(env.DB.prepare(`DELETE FROM flow_versions WHERE flow_id = ? AND status = 'draft'`).bind(id));
  await env.DB.batch(stmts);
  return json({ ok: true, version, versions: flowVersionInfo((await publishedMeta(env.DB, id)).get(id) ?? []) });
});
