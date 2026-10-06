// Admin: set one interface text, or delete it to go back to the built-in default.
import { body, json, now, requireAdmin, route, type Handler } from '../../_lib/http';
import { cleanText, UPSERT_TEXT } from '../../_lib/texts';

export const onRequestPut: Handler = route(async ({ request, env, data, params }) => {
  const me = requireAdmin(data);
  const b = await body<{ value?: unknown }>(request, 20_000);
  const t = cleanText(params.key, b.value);
  await env.DB.prepare(UPSERT_TEXT).bind(t.key, t.value, me.username, now()).run();
  return json({ ok: true, key: t.key, value: t.value });
});

export const onRequestDelete: Handler = route(async ({ env, data, params }) => {
  requireAdmin(data);
  const t = cleanText(params.key, '');
  await env.DB.prepare('DELETE FROM ui_texts WHERE key = ?').bind(t.key).run();
  return json({ ok: true });
});
