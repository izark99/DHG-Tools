import { hashPassword, passwordProblem } from '../../_lib/auth';
import { body, error, json, now, requireAdmin, route, type Handler } from '../../_lib/http';

const USERNAME = /^[a-z0-9._-]{3,40}$/;

export const onRequestGet: Handler = route(async ({ env, data }) => {
  requireAdmin(data);
  const { results } = await env.DB.prepare(
    'SELECT username, display_name, role, must_change_password, active, failed_count, locked_until, created_at FROM users ORDER BY username',
  ).all();
  return json({ users: results });
});

export const onRequestPost: Handler = route(async ({ request, env, data }) => {
  requireAdmin(data);
  const b = await body<{ username?: unknown; display_name?: unknown; role?: unknown; password?: unknown }>(request, 10_000);
  const username = typeof b.username === 'string' ? b.username.trim().toLowerCase() : '';
  if (!USERNAME.test(username)) return error(400, 'Tên đăng nhập 3–40 ký tự: a-z, 0-9, . _ -');
  const role = b.role === 'admin' ? 'admin' : 'user';
  const problem = passwordProblem(b.password);
  if (problem) return error(400, problem);
  const exists = await env.DB.prepare('SELECT 1 FROM users WHERE username = ?').bind(username).first();
  if (exists) return error(409, 'Tên đăng nhập đã tồn tại');
  const { hash, salt } = await hashPassword(b.password as string);
  await env.DB.prepare(
    `INSERT INTO users (username, display_name, role, password_hash, password_salt, must_change_password, active, failed_count, created_at)
     VALUES (?, ?, ?, ?, ?, 1, 1, 0, ?)`,
  )
    .bind(username, typeof b.display_name === 'string' ? b.display_name.slice(0, 100) : '', role, hash, salt, now())
    .run();
  return json({ ok: true }, 201);
});
