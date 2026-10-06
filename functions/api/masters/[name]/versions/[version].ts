// One version of a master table: read it, or cancel / restore its effect (it is never deleted).
import { body, error, json, now, requireAdmin, requireUser, route, type Handler } from '../../../../_lib/http';
import { masterVersion, tableVersions } from '../../../../_lib/masters';

export const onRequestGet: Handler = route(async ({ env, data, params }) => {
  requireUser(data);
  const r = await masterVersion(env.DB, String(params.name), Number(params.version));
  if (!r) return error(404, 'Không có phiên bản này');
  return json({
    name: r.name,
    version: r.version,
    effective_from: r.effective_from,
    note: r.note,
    by: r.created_by,
    at: r.created_at,
    cancelled: !!r.cancelled_at,
    columns: JSON.parse(r.columns_json),
    rows: JSON.parse(r.rows_json),
  });
});

// POST {action: "cancel" | "restore"} (admin)
export const onRequestPost: Handler = route(async ({ request, env, data, params }) => {
  const me = requireAdmin(data);
  const name = String(params.name);
  const version = Number(params.version);
  const b = await body<{ action?: unknown }>(request, 1_000);
  if (b.action !== 'cancel' && b.action !== 'restore') return error(400, 'action phải là cancel hoặc restore');
  if (!(await masterVersion(env.DB, name, version))) return error(404, 'Không có phiên bản này');
  const cancel = b.action === 'cancel';
  await env.DB.prepare('UPDATE master_versions SET cancelled_at = ?, cancelled_by = ? WHERE name = ? AND version = ?')
    .bind(cancel ? now() : null, cancel ? me.username : null, name, version)
    .run();
  return json({ ok: true, versions: await tableVersions(env.DB, name) });
});
