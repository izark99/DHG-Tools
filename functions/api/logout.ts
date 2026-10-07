import { json, route, type Handler } from '../_lib/http';
import { clearCookie, deleteSession } from '../_lib/session';

export const onRequestPost: Handler = route(async ({ request, env }) => {
  await deleteSession(env.DB, request);
  return json({ ok: true }, 200, { 'Set-Cookie': clearCookie() });
});
