// Change own password. Deletes every session of the user, then opens a fresh one.
import { hashPassword, passwordProblem, verifyPassword } from '../_lib/auth';
import { body, error, json, requireUser, route, type Handler } from '../_lib/http';
import { createSession, deleteUserSessions } from '../_lib/session';

export const onRequestPost: Handler = route(async ({ request, env, data }) => {
  const me = requireUser(data);
  const b = await body<{ current?: unknown; next?: unknown }>(request, 10_000);
  const row = await env.DB.prepare('SELECT password_hash, password_salt FROM users WHERE username = ?')
    .bind(me.username)
    .first<{ password_hash: string; password_salt: string }>();
  if (!row || typeof b.current !== 'string' || !(await verifyPassword(b.current, row.password_hash, row.password_salt)))
    return error(400, 'Mật khẩu hiện tại không đúng');
  const problem = passwordProblem(b.next);
  if (problem) return error(400, problem);
  if (b.next === b.current) return error(400, 'Mật khẩu mới phải khác mật khẩu cũ');
  const { hash, salt } = await hashPassword(b.next as string);
  await env.DB.prepare('UPDATE users SET password_hash = ?, password_salt = ?, must_change_password = 0 WHERE username = ?')
    .bind(hash, salt, me.username)
    .run();
  await deleteUserSessions(env.DB, me.username);
  const cookie = await createSession(env.DB, me.username);
  return json({ ok: true }, 200, { 'Set-Cookie': cookie });
});
