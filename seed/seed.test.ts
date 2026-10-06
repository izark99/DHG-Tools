// The five starter flows: valid against the masters, and a run on synthetic payroll rows has no error
// issue and exports. Runs on the invented mini masters (CI) and, when present, on the local extract.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { proposeMapping, readInput, type ParsedInput } from '../src/engine/inputs';
import { emptyLedger } from '../src/engine/ledger';
import { runFlow } from '../src/engine/run';
import type { FlowConfig, MasterTable } from '../src/engine/types';
import { contextFromMasters, validateConfig } from '../src/engine/validate';
import { writeForms } from '../src/excel/writeForms';
import { MINI_MASTERS } from './fixture';
import { FLOWS } from './flows/index';
import { synthetic } from './synthetic';

const LOCAL = 'reference/out/masters.json';
const sets: [string, Record<string, MasterTable>][] = [['mini', MINI_MASTERS]];
if (existsSync(LOCAL)) {
  const list = (JSON.parse(readFileSync(LOCAL, 'utf8')) as { masters: MasterTable[] }).masters;
  sets.push(['local', Object.fromEntries(list.map((t) => [t.name, t]))]);
}

/** Rows keyed by field id → a sheet with the first alias as header → the normal reader. */
function parse(cfg: FlowConfig, inputs: Record<string, Record<string, unknown>[]>): Record<string, ParsedInput> {
  const out: Record<string, ParsedInput> = {};
  for (const def of cfg.inputs) {
    const rows = inputs[def.id] ?? [];
    const header = def.fields.map((f) => f.aliases[0]);
    const sheet = { name: def.sheet || def.id, rows: [header, ...rows.map((r) => def.fields.map((f) => (r[f.id] ?? null) as string | number | null))] };
    const prop = proposeMapping([sheet], def)!;
    expect(prop.missingRequired, `${cfg.id}/${def.id} required fields`).toEqual([]);
    expect(prop.missingOptional, `${cfg.id}/${def.id} aliases`).toEqual([]);
    out[def.id] = readInput([sheet], def, prop);
  }
  return out;
}

describe.each(sets)('seed flows on %s masters', (_name, masters) => {
  it.each(FLOWS.map((f) => [f.id, f] as const))('%s', async (_id, cfg) => {
    expect(validateConfig(cfg, contextFromMasters(masters))).toEqual([]);
    const syn = synthetic(cfg.id, masters);
    const r = runFlow({ config: cfg, masters, inputs: parse(cfg, syn.inputs), run: syn.run as never, ledger: emptyLedger() });
    const errors = r.issues.filter((i) => i.level === 'error').map((i) => `${i.source}: ${i.message} [${i.keys.slice(0, 3).join(', ')}]`);
    expect(errors).toEqual([]);
    expect(r.blocked).toBe(false);
    expect(r.form02?.rows.length ?? 0).toBeGreaterThan(0);
    const { buffer, fileName } = await writeForms(cfg, r);
    expect(buffer.byteLength).toBeGreaterThan(1000);
    expect(fileName).toMatch(/^Form_.*\.xlsx$/);
  });
});
