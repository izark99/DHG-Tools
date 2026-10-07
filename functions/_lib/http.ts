export interface Env {
  DB: D1Database;
}

export interface SessionUser {
  username: string;
  display_name: string;
  role: 'admin' | 'user';
  must_change_password: number;
}

export interface Data extends Record<string, unknown> {
  user?: SessionUser;
}

export type Handler = PagesFunction<Env, string, Data>;

export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy':
    "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cache-Control': 'no-store',
};

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

export const error = (status: number, message: string) => json({ error: message }, status);

export async function body<T = Record<string, unknown>>(req: Request, maxBytes = 4_000_000): Promise<T> {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, 'Dữ liệu quá lớn');
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, 'JSON không hợp lệ');
  }
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function requireUser(data: Data): SessionUser {
  if (!data.user) throw new HttpError(401, 'Chưa đăng nhập');
  return data.user;
}

export function requireAdmin(data: Data): SessionUser {
  const u = requireUser(data);
  if (u.role !== 'admin') throw new HttpError(403, 'Chỉ admin được phép');
  return u;
}

export const now = () => new Date().toISOString();

/** Wrap a handler so HttpError becomes a JSON response. */
export function route(h: Handler): Handler {
  return async (ctx) => {
    try {
      return await h(ctx);
    } catch (e) {
      if (e instanceof HttpError) return error(e.status, e.message);
      console.error('api error', e instanceof Error ? e.message : 'unknown');
      return error(500, 'Lỗi máy chủ');
    }
  };
}

export function methodNotAllowed(): Response {
  return error(405, 'Method not allowed');
}
