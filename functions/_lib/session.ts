import { COOKIE, newToken, readCookie, sessionCookie, sha256Hex, SESSION_HOURS } from './auth';
import { now, type SessionUser } from './http';

export async function createSession(db: D1Database, username: string): Promise<string> {
  const token = newToken();
  const expires = new Date(Date.now() + SESSION_HOURS * 3600_000).toISOString();
  await db
    .prepare('INSERT INTO sessions (token_hash, username, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256Hex(token), username, expires)
    .run();
  // opportunistic cleanup of expired sessions
  await db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now()).run();
  return sessionCookie(token, SESSION_HOURS * 3600);
}

export async function sessionUser(db: D1Database, req: Request): Promise<SessionUser | null> {
  const token = readCookie(req, COOKIE);
  if (!token || token.length > 100) return null;
  const row = await db
    .prepare(
      `SELECT u.username, u.display_name, u.role, u.must_change_password
       FROM sessions s JOIN users u ON u.username = s.username
       WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`,
    )
    .bind(await sha256Hex(token), now())
    .first<SessionUser>();
  return row ?? null;
}

export async function deleteSession(db: D1Database, req: Request): Promise<void> {
  const token = readCookie(req, COOKIE);
  if (token) await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
}

export async function deleteUserSessions(db: D1Database, username: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE username = ?').bind(username).run();
}

export const clearCookie = () => sessionCookie('', 0);
