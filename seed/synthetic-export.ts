// Writes the synthetic payroll rows of each starter flow as an .xlsx (one sheet per input, header =
// the payroll-export header text), so the same data can be pasted into the original workbook and the
// two results compared during the parallel run.
//   node seed/synthetic-export.ts            → reference/out/synthetic/<FLOW>_synthetic.xlsx
// Uses reference/out/masters.json when present (units are real codes), else the invented mini masters.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import type { MasterTable } from '../src/engine/types.ts';
import { MINI_MASTERS } from './fixture.ts';
import { FLOWS } from './flows/index.ts';
import { synthetic } from './synthetic.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const local = join(root, 'reference', 'out', 'masters.json');
const masters: Record<string, MasterTable> = existsSync(local)
  ? Object.fromEntries((JSON.parse(readFileSync(local, 'utf8')) as { masters: MasterTable[] }).masters.map((t) => [t.name, t]))
  : MINI_MASTERS;
const outDir = join(root, 'reference', 'out', 'synthetic');
mkdirSync(outDir, { recursive: true });

for (const cfg of FLOWS) {
  const syn = synthetic(cfg.id, masters);
  const wb = new ExcelJS.Workbook();
  for (const def of cfg.inputs) {
    const ws = wb.addWorksheet(def.sheet || def.id);
    ws.addRow(def.fields.map((f) => f.aliases[0]));
    ws.getRow(1).font = { bold: true };
    for (const r of syn.inputs[def.id] ?? []) ws.addRow(def.fields.map((f) => r[f.id] ?? null));
    def.fields.forEach((f, i) => {
      if (f.type === 'text') ws.getColumn(i + 1).numFmt = '@';
      ws.getColumn(i + 1).width = Math.max(10, Math.min(30, f.aliases[0].length + 2));
    });
  }
  const run = wb.addWorksheet('Run');
  run.addRow(['Tham số', 'Giá trị']);
  for (const [k, v] of Object.entries(syn.run)) run.addRow([k, v]);
  const file = join(outDir, `${cfg.id}_synthetic.xlsx`);
  await wb.xlsx.writeFile(file);
  console.log(file);
}
