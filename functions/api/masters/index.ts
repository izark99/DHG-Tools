import { json, requireUser, route, type Handler } from '../../_lib/http';
import { allMasters } from '../../_lib/masters';

// GET /api/masters → every master table (settings only, needed by the browser to run flows).
export const onRequestGet: Handler = route(async ({ env, data }) => {
  requireUser(data);
  return json({ tables: await allMasters(env.DB) });
});
