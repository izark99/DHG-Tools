import { LOCK_AFTER, LOCK_MINUTES, pbkdf2, randomBytes, verifyPassword } from '../_lib/auth';
import { body, error, json, now, route, type Handler } from '../_lib/http';
import { createSession } from '../_lib/session';

const GENERIC = 'Sai tên đăng nhập hoặc mật khẩu, hoặc tài khoản đang tạm khoá';

interface UserRow {
  username: string;
  display_name: string;
  role: string;
  password_hash: string;
  password_salt: string;
  must_change_password: number;
  active: number;
  failed_count: number;
  locked_until: string | null;
}

export const onRequestPost: Handler = route(async ({ request, env }) => {
  const b = await body<{ username?: unknown; password?: unknown }>(request, 10_000);
  const username = typeof b.username === 'string' ? b.username.trim().toLowerCase() : '';
  const password = typeof b.password === 'string' ? b.password : '';
  if (!username || !password || password.length > 200) return error(401, GENERIC);

  const u = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first<UserRow>();
  if (!u || !u.active) {
    await pbkdf2(password, randomBytes(16)); // same cost as a real check
    return error(401, GENERIC);
  }
  const t = now();
  if (u.locked_until && u.locked_until > t) return error(401, GENERIC);

  if (!(await verifyPassword(password, u.password_hash, u.password_salt))) {
    const failed = (u.locked_until && u.locked_until <= t ? 0 : u.failed_count) + 1;
    const lock = failed >= LOCK_AFTER ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null;
    await env.DB.prepare('UPDATE users SET failed_count = ?, locked_until = ? WHERE username = ?')
      .bind(lock ? 0 : failed, lock, username)
      .run();
    return error(401, GENERIC);
  }

  await env.DB.prepare('UPDATE users SET failed_count = 0, locked_until = NULL WHERE username = ?').bind(username).run();
  const cookie = await createSession(env.DB, username);
  return json(
    { user: { username: u.username, display_name: u.display_name, role: u.role, must_change_password: !!u.must_change_password } },
    200,
    { 'Set-Cookie': cookie },
  );
});
