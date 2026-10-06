import { currentPeriod } from '../../../src/engine/effective';
import { json, requireUser, route, type Handler } from '../../_lib/http';
import { catalog, cleanPeriod, mastersAt } from '../../_lib/masters';

// GET /api/masters?period=YYYY-MM → the tables that apply to that payroll period (default: now),
// plus every table's version list (no rows). Settings only, needed by the browser to run flows.
export const onRequestGet: Handler = route(async ({ request, env, data }) => {
  requireUser(data);
  const q = new URL(request.url).searchParams.get('period');
  const period = q ? cleanPeriod(q, 'Kỳ') : currentPeriod();
  const [tables, cat] = await Promise.all([mastersAt(env.DB, period), catalog(env.DB)]);
  return json({ period, tables, catalog: cat });
});
