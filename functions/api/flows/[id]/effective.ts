// GET ?period=YYYY-MM → the published version (with config) that applies to that payroll period.
import { currentPeriod } from '../../../../src/engine/effective';
import { error, json, requireUser, route, type Handler } from '../../../_lib/http';
import { effectiveFlow } from '../../../_lib/flows';
import { cleanPeriod } from '../../../_lib/masters';

export const onRequestGet: Handler = route(async ({ request, env, data, params }) => {
  const me = requireUser(data);
  const id = String(params.id);
  const flow = await env.DB.prepare('SELECT id, name, active FROM flows WHERE id = ?').bind(id).first<{ id: string; name: string; active: number }>();
  if (!flow || (!flow.active && me.role !== 'admin')) return error(404, 'Không có flow này');
  const q = new URL(request.url).searchParams.get('period');
  const period = q ? cleanPeriod(q, 'Kỳ') : currentPeriod();
  const { pick, versions } = await effectiveFlow(env.DB, id, period);
  return json({ flow: { id: flow.id, name: flow.name }, period, effective: pick, versions });
});
