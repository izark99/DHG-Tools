// Password hashing and sessions (PLAN §3.1). WebCrypto only.

export const PBKDF2_ITERATIONS = 100_000;
export const SESSION_HOURS = 12;
export const LOCK_AFTER = 5;
export const LOCK_MINUTES = 15;
export const MIN_PASSWORD = 10;
export const COOKIE = 'cb_session';

const enc = new TextEncoder();

export function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

export async function pbkdf2(password: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS }, key, 256);
  return toB64(bits);
}

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(16);
  return { hash: await pbkdf2(password, salt), salt: toB64(salt) };
}

export function constantTimeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  const h = await pbkdf2(password, fromB64(salt));
  return constantTimeEqual(h, hash);
}

export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function newToken(): string {
  return toB64(randomBytes(32)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function sessionCookie(token: string, maxAgeSec: number): string {
  return `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAgeSec}`;
}

export function readCookie(req: Request, name: string): string | null {
  const h = req.headers.get('Cookie');
  if (!h) return null;
  for (const part of h.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

export function passwordProblem(pw: unknown): string | null {
  if (typeof pw !== 'string') return 'Mật khẩu không hợp lệ';
  if (pw.length < MIN_PASSWORD) return `Mật khẩu tối thiểu ${MIN_PASSWORD} ký tự`;
  if (pw.length > 200) return 'Mật khẩu quá dài';
  return null;
}
