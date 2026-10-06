// Writes the five starter flows as JSON, and — when the local master extract exists — one backup file
// that Admin › Backup can import (masters + flows as drafts).
//   node seed/build.ts
// The bundle (with master data and signer names from the workbooks) is written under reference/out/,
// which is git-ignored: it is company data.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FlowConfig } from '../src/engine/types.ts';
import { FLOWS } from './flows/index.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const outDir = join(root, 'seed', 'out');
mkdirSync(outDir, { recursive: true });
for (const f of FLOWS) writeFileSync(join(outDir, `${f.id}.config.json`), JSON.stringify(f, null, 2) + '\n');
console.log(`seed/out: ${FLOWS.map((f) => `${f.id}.config.json`).join(', ')}`);

const mastersFile = join(root, 'reference', 'out', 'masters.json');
if (existsSync(mastersFile)) {
  const m = JSON.parse(readFileSync(mastersFile, 'utf8')) as { masters: unknown[]; runDefaults?: Record<string, Record<string, string>> };
  const flows = FLOWS.map((f, i) => {
    const defaults = m.runDefaults?.[f.id] ?? {};
    const config: FlowConfig = { ...f, runParams: f.runParams.map((p) => (defaults[p.id] ? { ...p, default: defaults[p.id] } : p)) };
    return { id: f.id, name: f.name, sort: i + 1, active: true, config };
  });
  const bundle = join(root, 'reference', 'out', 'cb-forms-seed.backup.json');
  mkdirSync(dirname(bundle), { recursive: true });
  writeFileSync(bundle, JSON.stringify({ kind: 'cb-forms-backup', exportedAt: new Date().toISOString(), flows, masters: m.masters }, null, 1));
  console.log(`bundle: ${bundle} (${m.masters.length} master tables, ${flows.length} flows)`);
} else console.log('no reference/out/masters.json — run scripts/seed/extract_masters.py first to build the import bundle');
