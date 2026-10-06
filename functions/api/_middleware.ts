// Every /api route: security headers, CSRF origin check, session required (except login).
import { error, SECURITY_HEADERS, type Handler } from '../_lib/http';
import { sessionUser } from '../_lib/session';

const PUBLIC = new Set(['/api/login']);
const ALLOWED_WHILE_MUST_CHANGE = new Set(['/api/me', '/api/password', '/api/logout']);

function withHeaders(res: Response): Response {
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) r.headers.set(k, v);
  return r;
}

export const onRequest: Handler = async (ctx) => {
  const { request, env } = ctx;
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const origin = request.headers.get('Origin');
    if (!origin || origin !== url.origin) return withHeaders(error(403, 'Origin không hợp lệ'));
  }

  if (!PUBLIC.has(path)) {
    const user = await sessionUser(env.DB, request);
    if (!user) return withHeaders(error(401, 'Chưa đăng nhập'));
    if (user.must_change_password && !ALLOWED_WHILE_MUST_CHANGE.has(path))
      return withHeaders(error(403, 'Cần đổi mật khẩu trước khi tiếp tục'));
    ctx.data.user = user;
  }
  return withHeaders(await ctx.next());
};
