import { currentPeriod, effectiveAt } from '../../../src/engine/effective';
import { body, error, json, now, requireAdmin, requireUser, route, type Handler } from '../../_lib/http';
import { cleanConfig, FLOW_ID, flowVersionInfo, publishedMeta } from '../../_lib/flows';

// GET → flows with the version in force now (or, if none applies yet, the latest one) and their
// version list. Users see active flows only. The run page picks the version by period itself.
export const onRequestGet: Handler = route(async ({ env, data }) => {
  const me = requireUser(data);
  const { results } = await env.DB.prepare(
    `SELECT f.id, f.name, f.sort, f.active,
            EXISTS (SELECT 1 FROM flow_versions d WHERE d.flow_id = f.id AND d.status = 'draft') AS has_draft
     FROM flows f ORDER BY f.sort, f.id`,
  ).all<{ id: string; name: string; sort: number; active: number; has_draft: number }>();
  const meta = await publishedMeta(env.DB);
  const today = currentPeriod();
  const picks = new Map<string, number>();
  for (const [id, rows] of meta) {
    const m = rows.map((r) => ({ version: r.version, effectiveFrom: r.effective_from, cancelled: !!r.cancelled_at, id: r.id }));
    const p = effectiveAt(m, today) ?? m.filter((x) => !x.cancelled).sort((a, b) => b.version - a.version)[0];
    if (p) picks.set(id, p.id);
  }
  const configs = new Map<number, { config_json: string }>();
  const ids = [...picks.values()];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const { results: rs } = await env.DB.prepare(`SELECT id, config_json FROM flow_versions WHERE id IN (${chunk.map(() => '?').join(',')})`)
      .bind(...chunk)
      .all<{ id: number; config_json: string }>();
    for (const r of rs) configs.set(r.id, r);
  }
  const flows = results
    .filter((r) => me.role === 'admin' || r.active)
    .map((r) => {
      const rows = meta.get(r.id) ?? [];
      const versions = flowVersionInfo(rows, today);
      const pickId = picks.get(r.id);
      const pickRow = rows.find((x) => x.id === pickId);
      const info = pickRow ? versions.find((v) => v.version === pickRow.version)! : null;
      return {
        id: r.id,
        name: r.name,
        sort: r.sort,
        active: !!r.active,
        published: info ? { ...info, config: JSON.parse(configs.get(pickId!)!.config_json) } : null,
        versions,
        hasDraft: me.role === 'admin' ? !!r.has_draft : undefined,
      };
    });
  return json({ period: today, flows });
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
