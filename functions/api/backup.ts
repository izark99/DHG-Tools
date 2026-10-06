// Admin: export / import the whole configuration (flows + master tables + interface texts) as one JSON file.
// Master tables are exported with every version (effective period, note, cancelled). Import adds the
// versions it does not already have (nothing is overwritten or deleted); a table without a version
// list (older backups, the seed bundle) becomes one new version effective from `effectiveFrom`
// (default: from the beginning). Each flow's config is loaded as a DRAFT (the admin reviews and
// publishes it with an effective period); no published version is changed.
import { body, error, json, now, requireAdmin, route, type Handler } from '../_lib/http';
import { cleanConfig, FLOW_ID } from '../_lib/flows';
import { BEGINNING, PERIOD } from '../../src/engine/effective';
import { cleanNote, cleanTable } from '../_lib/masters';
import { cleanText, UPSERT_TEXT } from '../_lib/texts';

export const onRequestGet: Handler = route(async ({ env, data }) => {
  requireAdmin(data);
  const { results: flows } = await env.DB.prepare('SELECT id, name, sort, active FROM flows ORDER BY sort, id').all<{
    id: string;
    name: string;
    sort: number;
    active: number;
  }>();
  const { results: versions } = await env.DB.prepare(
    'SELECT flow_id, version, status, config_json, created_by, created_at, effective_from, note, cancelled_at, cancelled_by FROM flow_versions ORDER BY flow_id, version',
  ).all<{
    flow_id: string;
    version: number;
    status: string;
    config_json: string;
    created_by: string;
    created_at: string;
    effective_from: string;
    note: string | null;
    cancelled_at: string | null;
    cancelled_by: string | null;
  }>();
  const { results: mv } = await env.DB.prepare('SELECT * FROM master_versions ORDER BY name, version').all<{
    name: string;
    version: number;
    effective_from: string;
    columns_json: string;
    rows_json: string;
    note: string | null;
    created_by: string | null;
    created_at: string;
    cancelled_at: string | null;
    cancelled_by: string | null;
  }>();
  const masters = new Map<string, unknown[]>();
  for (const r of mv)
    masters.set(r.name, [
      ...(masters.get(r.name) ?? []),
      {
        version: r.version,
        effective_from: r.effective_from,
        note: r.note,
        created_by: r.created_by,
        created_at: r.created_at,
        cancelled_at: r.cancelled_at,
        cancelled_by: r.cancelled_by,
        columns: JSON.parse(r.columns_json),
        rows: JSON.parse(r.rows_json),
      },
    ]);
  return json({
    kind: 'cb-forms-backup',
    exportedAt: now(),
    flows: flows.map((f) => ({
      ...f,
      active: !!f.active,
      versions: versions
        .filter((v) => v.flow_id === f.id)
        .map((v) => ({
          version: v.version,
          status: v.status,
          created_by: v.created_by,
          created_at: v.created_at,
          effective_from: v.effective_from,
          note: v.note,
          cancelled_at: v.cancelled_at,
          cancelled_by: v.cancelled_by,
          config: JSON.parse(v.config_json),
        })),
    })),
    masters: [...masters.entries()].map(([name, versions]) => ({ name, versions })),
    texts: (await env.DB.prepare('SELECT key, value FROM ui_texts ORDER BY key').all<{ key: string; value: string }>()).results,
  });
});

interface ImportMasterVersion {
  effective_from?: unknown;
  note?: unknown;
  created_by?: unknown;
  created_at?: unknown;
  cancelled_at?: unknown;
  cancelled_by?: unknown;
  columns: unknown;
  rows: unknown;
}
interface ImportMaster {
  name: string;
  columns?: unknown;
  rows?: unknown;
  effectiveFrom?: unknown;
  versions?: ImportMasterVersion[];
}

const str = (v: unknown, max: number) => (typeof v === 'string' && v ? v.slice(0, max) : null);

interface ImportFlow {
  id: string;
  name: string;
  sort?: number;
  active?: boolean;
  versions?: { version: number; status: string; config: unknown }[];
  config?: unknown;
}

export const onRequestPost: Handler = route(async ({ request, env, data }) => {
  const me = requireAdmin(data);
  const b = await body<{
    kind?: string;
    flows?: ImportFlow[];
    masters?: ImportMaster[];
    texts?: { key: unknown; value: unknown }[];
  }>(request, 20_000_000);
  if (b.kind !== 'cb-forms-backup') return error(400, 'Không phải file backup của ứng dụng');
  const stmts: D1PreparedStatement[] = [];
  const t = now();
  const masterStmt: number[] = [];
  for (const m of b.masters ?? []) {
    const name = String(m.name);
    const list: ImportMasterVersion[] = Array.isArray(m.versions)
      ? m.versions
      : [{ columns: m.columns, rows: m.rows, effective_from: m.effectiveFrom, note: 'Nhập từ file backup' }];
    for (const v of list) {
      const clean = cleanTable(name, v);
      const from = typeof v.effective_from === 'string' && PERIOD.test(v.effective_from) ? v.effective_from : BEGINNING;
      const at = str(v.created_at, 40) ?? t;
      const cols = JSON.stringify(clean.columns);
      const rows = JSON.stringify(clean.rows);
      // append unless a version with the same start and the same content is already there
      // (re-importing a backup or the seed bundle adds nothing)
      stmts.push(
        env.DB.prepare(
          `INSERT INTO master_versions (name, version, effective_from, columns_json, rows_json, note, created_by, created_at, cancelled_at, cancelled_by)
           SELECT ?, (SELECT COALESCE(MAX(version), 0) + 1 FROM master_versions WHERE name = ?), ?, ?, ?, ?, ?, ?, ?, ?
           WHERE NOT EXISTS (SELECT 1 FROM master_versions WHERE name = ? AND effective_from = ? AND columns_json = ? AND rows_json = ?)`,
        ).bind(name, name, from, cols, rows, cleanNote(v.note), str(v.created_by, 64) ?? me.username, at, str(v.cancelled_at, 40), str(v.cancelled_by, 64), name, from, cols, rows),
      );
      masterStmt.push(stmts.length - 1);
    }
  }
  let flowCount = 0;
  for (const f of b.flows ?? []) {
    if (!FLOW_ID.test(String(f.id))) return error(400, `Mã flow không hợp lệ: ${f.id}`);
    const versions = (f.versions ?? []).slice().sort((a, b2) => (a.status === 'draft' ? 1 : 0) - (b2.status === 'draft' ? 1 : 0) || a.version - b2.version);
    const src = f.config ?? versions.filter((v) => v.status === 'published').pop()?.config ?? versions.pop()?.config;
    if (!src) continue;
    const { json: cfg } = cleanConfig(f.id, src);
    stmts.push(
      env.DB.prepare(
        `INSERT INTO flows (id, name, sort, active) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, sort = excluded.sort, active = excluded.active`,
      ).bind(f.id, String(f.name || f.id).slice(0, 100), Number(f.sort ?? 0), f.active === false ? 0 : 1),
      env.DB.prepare(`DELETE FROM flow_versions WHERE flow_id = ? AND status = 'draft'`).bind(f.id),
      env.DB.prepare(`INSERT INTO flow_versions (flow_id, version, config_json, status, created_by, created_at) VALUES (?, 0, ?, 'draft', ?, ?)`).bind(
        f.id,
        cfg,
        me.username,
        t,
      ),
    );
    flowCount++;
  }
  const texts = Array.isArray(b.texts) ? b.texts : [];
  for (const x of texts) {
    const c = cleanText(x?.key, x?.value);
    stmts.push(env.DB.prepare(UPSERT_TEXT).bind(c.key, c.value, me.username, t));
  }
  const res = stmts.length ? await env.DB.batch(stmts) : [];
  const masterVersions = masterStmt.reduce((n, i) => n + (res[i]?.meta.changes ?? 0), 0);
  return json({ ok: true, masters: (b.masters ?? []).length, masterVersions, flows: flowCount, texts: texts.length });
});
