// Only a period and a SHA-256 hash of the latest ledger — never any amount.
import { body, error, json, now, requireUser, route, type Handler } from '../../_lib/http';

const NAME = /^[A-Za-z0-9_-]{1,40}$/;

export const onRequestGet: Handler = route(async ({ env, data, params }) => {
  requireUser(data);
  const ledger = String(params.ledger);
  if (!NAME.test(ledger)) return error(400, 'Tên ledger không hợp lệ');
  const mark = await env.DB.prepare('SELECT ledger, last_period, file_hash, updated_by, updated_at FROM ledger_marks WHERE ledger = ?')
    .bind(ledger)
    .first();
  return json({ mark: mark ?? null });
});

export const onRequestPut: Handler = route(async ({ request, env, data, params }) => {
  const me = requireUser(data);
  const ledger = String(params.ledger);
  if (!NAME.test(ledger)) return error(400, 'Tên ledger không hợp lệ');
  const b = await body<{ last_period?: unknown; file_hash?: unknown }>(request, 2_000);
  if (typeof b.last_period !== 'string' || !/^\d{4}-\d{2}$/.test(b.last_period)) return error(400, 'Kỳ không hợp lệ');
  if (typeof b.file_hash !== 'string' || !/^[0-9a-f]{64}$/.test(b.file_hash)) return error(400, 'Hash không hợp lệ');
  await env.DB.prepare(
    `INSERT INTO ledger_marks (ledger, last_period, file_hash, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(ledger) DO UPDATE SET last_period = excluded.last_period, file_hash = excluded.file_hash,
       updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
  )
    .bind(ledger, b.last_period, b.file_hash, me.username, now())
    .run();
  return json({ ok: true });
});
