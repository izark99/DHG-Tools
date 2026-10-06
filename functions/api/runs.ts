// Run metadata only: who ran which flow version for which period.
import { body, error, json, now, requireUser, route, type Handler } from '../_lib/http';

export const onRequestGet: Handler = route(async ({ env, data }) => {
  requireUser(data);
  const { results } = await env.DB.prepare(
    `SELECT flow_id, flow_version, period, user, at FROM run_log WHERE id IN (SELECT MAX(id) FROM run_log GROUP BY flow_id)`,
  ).all();
  return json({ latest: results });
});

export const onRequestPost: Handler = route(async ({ request, env, data }) => {
  const me = requireUser(data);
  const b = await body<{ flow_id?: unknown; flow_version?: unknown; period?: unknown }>(request, 2_000);
  if (typeof b.flow_id !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(b.flow_id)) return error(400, 'flow_id không hợp lệ');
  if (typeof b.period !== 'string' || !/^\d{4}-\d{2}$/.test(b.period)) return error(400, 'Kỳ không hợp lệ');
  const version = typeof b.flow_version === 'number' ? Math.trunc(b.flow_version) : null;
  await env.DB.prepare('INSERT INTO run_log (flow_id, flow_version, period, user, at) VALUES (?, ?, ?, ?, ?)')
    .bind(b.flow_id, version, b.period, me.username, now())
    .run();
  return json({ ok: true });
});
