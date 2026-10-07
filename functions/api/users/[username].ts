// Admin: change role / name, reset password (temporary, must change), activate / deactivate.
import { hashPassword, passwordProblem } from '../../_lib/auth';
import { body, error, json, requireAdmin, route, type Handler } from '../../_lib/http';
import { deleteUserSessions } from '../../_lib/session';

export const onRequestPatch: Handler = route(async ({ request, env, data, params }) => {
  const me = requireAdmin(data);
  const username = String(params.username).toLowerCase();
  const u = await env.DB.prepare('SELECT username, role, active FROM users WHERE username = ?')
    .bind(username)
    .first<{ username: string; role: string; active: number }>();
  if (!u) return error(404, 'Không có người dùng này');
  const b = await body<{ display_name?: unknown; role?: unknown; active?: unknown; password?: unknown; unlock?: unknown }>(request, 10_000);

  if (username === me.username && (b.role === 'user' || b.active === false))
    return error(400, 'Không thể tự hạ quyền hoặc tự khoá tài khoản của mình');

  if (typeof b.display_name === 'string')
    await env.DB.prepare('UPDATE users SET display_name = ? WHERE username = ?').bind(b.display_name.slice(0, 100), username).run();
  if (b.role === 'admin' || b.role === 'user')
    await env.DB.prepare('UPDATE users SET role = ? WHERE username = ?').bind(b.role, username).run();
  if (typeof b.active === 'boolean') {
    await env.DB.prepare('UPDATE users SET active = ? WHERE username = ?').bind(b.active ? 1 : 0, username).run();
    if (!b.active) await deleteUserSessions(env.DB, username);
  }
  if (b.unlock === true)
    await env.DB.prepare('UPDATE users SET failed_count = 0, locked_until = NULL WHERE username = ?').bind(username).run();
  if (b.password !== undefined) {
    const problem = passwordProblem(b.password);
    if (problem) return error(400, problem);
    const { hash, salt } = await hashPassword(b.password as string);
    await env.DB.prepare(
      'UPDATE users SET password_hash = ?, password_salt = ?, must_change_password = 1, failed_count = 0, locked_until = NULL WHERE username = ?',
    )
      .bind(hash, salt, username)
      .run();
    await deleteUserSessions(env.DB, username);
  }
  return json({ ok: true });
});
