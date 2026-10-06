// One master table. PUT never overwrites: it adds a version effective from a payroll period.
import { body, error, json, now, requireAdmin, requireUser, route, type Handler } from '../../../_lib/http';
import { cleanNote, cleanPeriod, cleanTable, insertMasterVersion, tableVersions, TABLE_NAME } from '../../../_lib/masters';

// GET → version list
export const onRequestGet: Handler = route(async ({ env, data, params }) => {
  requireUser(data);
  const name = String(params.name);
  const versions = await tableVersions(env.DB, name);
  if (!versions.length) return error(404, 'Không có bảng này');
  return json({ name, versions });
});

// PUT {columns, rows, effectiveFrom, note?} → new version (admin)
export const onRequestPut: Handler = route(async ({ request, env, data, params }) => {
  const me = requireAdmin(data);
  const name = String(params.name);
  const b = await body<{ columns?: unknown; rows?: unknown; effectiveFrom?: unknown; note?: unknown }>(request);
  const t = cleanTable(name, b);
  const from = cleanPeriod(b.effectiveFrom);
  await insertMasterVersion(env.DB, name, t, from, cleanNote(b.note), me.username, now()).run();
  const versions = await tableVersions(env.DB, name);
  return json({ ok: true, version: Math.max(...versions.map((v) => v.version)), versions });
});

// DELETE → remove the table with all its versions (admin; the UI asks twice)
export const onRequestDelete: Handler = route(async ({ env, data, params }) => {
  requireAdmin(data);
  const name = String(params.name);
  if (!TABLE_NAME.test(name)) return error(400, 'Tên bảng không hợp lệ');
  await env.DB.prepare('DELETE FROM master_versions WHERE name = ?').bind(name).run();
  return json({ ok: true });
});
