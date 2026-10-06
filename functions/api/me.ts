import { json, requireUser, route, type Handler } from '../_lib/http';

export const onRequestGet: Handler = route(async ({ data }) => {
  const u = requireUser(data);
  return json({ user: { ...u, must_change_password: !!u.must_change_password } });
});
