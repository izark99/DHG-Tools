import { body, error, json, now, requireAdmin, requireUser, route, type Handler } from '../../_lib/http';
import { cleanConfig, FLOW_ID } from '../../_lib/flows';

interface Row {
  id: string;
  name: string;
  sort: number;
  active: number;
  version: number | null;
  config_json: string | null;
  published_by: string | null;
  published_at: string | null;
  has_draft: number;
}

// GET → flows with their latest published config (users see active flows only).
export const onRequestGet: Handler = route(async ({ env, data }) => {
  const me = requireUser(data);
  const { results } = await env.DB.prepare(
    `SELECT f.id, f.name, f.sort, f.active,
            v.version, v.config_json, v.created_by AS published_by, v.created_at AS published_at,
            EXISTS (SELECT 1 FROM flow_versions d WHERE d.flow_id = f.id AND d.status = 'draft') AS has_draft
     FROM flows f
     LEFT JOIN flow_versions v ON v.id = (
       SELECT id FROM flow_versions WHERE flow_id = f.id AND status = 'published' ORDER BY version DESC LIMIT 1)
     ORDER BY f.sort, f.id`,
  ).all<Row>();
  const flows = results
    .filter((r) => me.role === 'admin' || r.active)
    .map((r) => ({
      id: r.id,
      name: r.name,
      sort: r.sort,
      active: !!r.active,
      published: r.version ? { version: r.version, by: r.published_by, at: r.published_at, config: JSON.parse(r.config_json!) } : null,
      hasDraft: me.role === 'admin' ? !!r.has_draft : undefined,
    }));
  return json({ flows });
});

// POST {id, name, config} → new flow with a draft (admin).
export const onRequestPost: Handler = route(async ({ request, env, data }) => {
  const me = requireAdmin(data);
  const b = await body<{ id?: unknown; name?: unknown; config?: unknown }>(request);
  const id = typeof b.id === 'string' ? b.id.trim() : '';
  if (!FLOW_ID.test(id)) return error(400, 'Mã flow: chữ cái đầu, tối đa 32 ký tự A-Z a-z 0-9 _');
  const name = typeof b.name === 'string' && b.name.trim() ? b.name.trim().slice(0, 100) : id;
  if (await env.DB.prepare('SELECT 1 FROM flows WHERE id = ?').bind(id).first()) return error(409, 'Mã flow đã tồn tại');
  const { json: cfg } = cleanConfig(id, { ...(b.config as object), name });
  const max = await env.DB.prepare('SELECT COALESCE(MAX(sort), 0) AS m FROM flows').first<{ m: number }>();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO flows (id, name, sort, active) VALUES (?, ?, ?, 1)').bind(id, name, (max?.m ?? 0) + 1),
    env.DB.prepare(`INSERT INTO flow_versions (flow_id, version, config_json, status, created_by, created_at) VALUES (?, 0, ?, 'draft', ?, ?)`).bind(
      id,
      cfg,
      me.username,
      now(),
    ),
  ]);
  return json({ ok: true }, 201);
});
