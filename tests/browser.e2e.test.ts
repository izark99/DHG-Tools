// End-to-end in Chromium against `wrangler pages dev` (production build + CSP + local D1).
// Run:  npm run build && npx wrangler pages dev dist --port 8788   (other shell)
//       E2E=1 ADMIN_PASSWORD=... npx vitest run
import ExcelJS from 'exceljs';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser, type Page, type Request } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config, EMPS, HEADER, masters } from '../src/test/fixture';

const BASE = process.env.BASE ?? 'http://127.0.0.1:8788';
const ADMIN = process.env.ADMIN_USER ?? 'admin';
const PASS = process.env.ADMIN_PASSWORD ?? '';
const CHROME = process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const RUN = String(Date.now() % 1_000_000);
const FLOW = `E${RUN}`;
const out = mkdtempSync(join(tmpdir(), 'cb-e2e-'));

let browser: Browser;
let page: Page;
const problems: string[] = [];
const requests: { url: string; method: string; body: string }[] = [];

async function salaryXlsx(rows: (string | number | null)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Bang luong');
  ws.addRow(['BẢNG LƯƠNG']);
  ws.addRow([]);
  ws.addRow(HEADER);
  for (const r of rows) ws.addRow(r);
  ws.getColumn(1).numFmt = '@';
  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

async function api(method: string, path: string, body?: unknown) {
  return page.evaluate(
    async ([m, p, b]) => {
      const r = await fetch(p as string, { method: m as string, headers: { 'Content-Type': 'application/json' }, body: b === undefined ? undefined : JSON.stringify(b) });
      return { status: r.status, json: await r.json().catch(() => null) };
    },
    [method, path, body] as const,
  );
}

async function downloadsOf(n: number, click: () => Promise<void>): Promise<string[]> {
  const files: string[] = [];
  const done = new Promise<void>((resolve) => {
    page.on('download', async (d) => {
      const p = join(out, d.suggestedFilename());
      await d.saveAs(p);
      files.push(p);
      if (files.length === n) resolve();
    });
  });
  await click();
  await done;
  page.removeAllListeners('download');
  return files.sort();
}

beforeAll(async () => {
  if (!PASS) throw new Error('set ADMIN_PASSWORD');
  browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({ acceptDownloads: true });
  page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/status of 40[013]/.test(m.text())) problems.push(`console: ${m.text()}`);
  });
  page.on('request', (r: Request) => requests.push({ url: r.url(), method: r.method(), body: r.postData() ?? '' }));
});

afterAll(async () => {
  await browser?.close();
});

describe('browser end-to-end', () => {
  it('logs in as admin', async () => {
    await page.goto(BASE);
    await page.getByLabel('Tên đăng nhập').fill(ADMIN);
    await page.getByLabel('Mật khẩu').fill(PASS);
    await page.getByRole('button', { name: 'Đăng nhập' }).click();
    await page.getByText('Chọn flow để chạy').waitFor();
  });

  it('master tables are saved and shown', async () => {
    for (const t of Object.values(masters)) expect((await api('PUT', `/api/masters/${t.name}`, { columns: t.columns, rows: t.rows })).status).toBe(200);
    await page.goto(`${BASE}/#/admin/masters`);
    await page.getByRole('button', { name: 'CostCenter' }).click();
    await page.getByText('3 dòng · 6 cột').waitFor();
  });

  it('creates a flow from a JSON file, blocks publishing an invalid formula, then publishes', async () => {
    const cfg = { ...config({ id: FLOW, name: `E2E ${RUN}` }), ledger: `e2e${RUN}` };
    await page.goto(`${BASE}/#/admin/flows`);
    await page.getByLabel('Mã flow (A-Z, 0-9, _)').fill(FLOW);
    await page.locator('input[type=file]').setInputFiles({ name: 'cfg.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(cfg)) });
    await page.getByRole('button', { name: 'Tạo (thành bản nháp)' }).click();
    await page.getByText('Đang sửa từ: bản nháp').waitFor();

    // break a formula → publish disabled with a clear message
    await page.getByRole('tab', { name: /^Bảng nhân viên/ }).click();
    const f = page.locator('.list-editor .item').nth(2).locator('textarea');
    await f.fill('[ins] + FOO(1)');
    await page.locator('.formula .ferr').getByText('tham chiếu tới cột đứng sau').first().waitFor();
    await page.locator('.formula .ferr').getByText('Hàm không hỗ trợ: FOO').first().waitFor();
    expect(await page.getByRole('button', { name: 'Publish' }).isDisabled()).toBe(true);
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/editor-error.png`, fullPage: false });
    // server refuses too
    await page.getByRole('button', { name: 'Lưu nháp' }).click();
    await page.getByText(/Đã lưu nháp. Còn \d+ lỗi/).waitFor();
    const refused = await api('POST', `/api/flows/${FLOW}/publish`, {});
    expect(refused.status).toBe(400);
    expect(JSON.stringify(refused.json)).toContain('FOO');

    await f.fill('SUMOF(in.SalaryTable.basic)');
    await page.getByRole('button', { name: 'Publish' }).click();
    await page.getByText('Đang sửa từ: phiên bản v1 đang dùng').waitFor();
  });

  it('versions: publish v2, roll back by re-publishing v1 as v3', async () => {
    const v1 = (await api('GET', `/api/flows/${FLOW}/versions/1`)).json.config;
    expect((await api('PUT', `/api/flows/${FLOW}/draft`, { config: { ...v1, fileName: 'X_{MM}.xlsx' } })).status).toBe(200);
    expect((await api('POST', `/api/flows/${FLOW}/publish`, {})).json.version).toBe(2);
    expect((await api('POST', `/api/flows/${FLOW}/publish`, { fromVersion: 1 })).json.version).toBe(3);
    const v3 = (await api('GET', `/api/flows/${FLOW}/versions/3`)).json.config;
    expect(v3).toEqual(v1);
    const v2 = (await api('GET', `/api/flows/${FLOW}/versions/2`)).json.config;
    expect(v2.fileName).toBe('X_{MM}.xlsx');
    await page.goto(`${BASE}/#/`);
    await page.goto(`${BASE}/#/admin/flows/${FLOW}`);
    await page.getByRole('tab', { name: 'Phiên bản' }).click();
    await page.getByText('v3 (đang dùng)').waitFor();
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/versions.png`, fullPage: true });
  });

  let ledger1 = '';
  it('runs the flow end to end and downloads Form 02/03 + ledger', async () => {
    await page.goto(`${BASE}/#/run/${FLOW}`);
    await page.getByLabel('Tháng').selectOption('9');
    await page.getByLabel('Năm').fill('2026');
    await page.getByLabel('Người lập').fill('Nguyễn Văn A');
    await page.locator('.input-block').first().locator('input[type=file]').setInputFiles({ name: 'luong.xlsx', mimeType: 'application/octet-stream', buffer: await salaryXlsx(EMPS) });
    await page.getByText(/3 dòng · sheet/).waitFor();
    await page.getByRole('button', { name: 'Tính' }).click();
    await page.getByText('Kết quả — kỳ 2026-09').waitFor();
    await page.getByRole('tab', { name: /^Form 02/ }).click();
    await page.getByText('Trích Thưởng quý_Q03.2026_D1-U1').waitFor();
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/run-form02.png`, fullPage: true });

    const files = await downloadsOf(2, () => page.getByRole('button', { name: 'Tải Form + Ledger' }).click());
    await page.getByText(/Đã tải Form_/).waitFor();
    const formFile = files.find((p) => p.includes('Form_'))!;
    ledger1 = files.find((p) => p.includes('Ledger_'))!;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(readFileSync(formFile) as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Form 02', 'Form 03']);
    const lw = new ExcelJS.Workbook();
    await lw.xlsx.load(readFileSync(ledger1) as unknown as ArrayBuffer);
    expect(lw.getWorksheet('accrual')!.rowCount).toBe(8);
  });

  it('second period adjusts from the ledger; an older ledger copy is flagged', async () => {
    await page.goto(`${BASE}/#/`);
    await page.goto(`${BASE}/#/run/${FLOW}`);
    await page.getByLabel('Tháng').selectOption('10');
    await page.getByLabel('Năm').fill('2026');
    await page.locator('.input-block').first().locator('input[type=file]').setInputFiles({ name: 'luong.xlsx', mimeType: 'application/octet-stream', buffer: await salaryXlsx(EMPS) });
    // no ledger chosen while one exists → blocking confirmation
    await page.getByText('mất toàn bộ lịch sử điều chỉnh').waitFor();
    await page.locator('.input-block').nth(1).locator('input[type=file]').setInputFiles(ledger1);
    await page.getByText(/7 dòng trích/).waitFor();
    expect(await page.getByText('không phải bản mới nhất').count()).toBe(0);
    await page.getByRole('button', { name: 'Tính' }).click();
    await page.getByText('Kết quả — kỳ 2026-10').waitFor();
    await page.getByRole('tab', { name: /^Form 02/ }).click();
    // quarterly bonus accrued in 09 but never paid → adjusted -2,000,000 in 10
    await page.getByRole('cell', { name: '-2,000,000' }).first().waitFor();
    await downloadsOf(2, () => page.getByRole('button', { name: 'Tải Form + Ledger' }).click());

    // using the period-09 ledger again is now stale
    await page.goto(`${BASE}/#/`);
    await page.goto(`${BASE}/#/run/${FLOW}`);
    await page.locator('.input-block').nth(1).locator('input[type=file]').setInputFiles(ledger1);
    await page.getByText('không phải bản mới nhất').waitFor();
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/stale-ledger.png`, fullPage: true });
    expect(await page.getByRole('button', { name: 'Tính' }).isDisabled()).toBe(true);
  });

  it('layout does not shift between tabs and pages', async () => {
    const boxes = (sel: string) =>
      page.$$eval(sel, (els) => els.map((e) => {
        const r = e.getBoundingClientRect();
        return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)].join(',');
      }));
    // flow editor: header, tab bar and every tab button stay put on every tab
    await page.goto(`${BASE}/#/`);
    await page.goto(`${BASE}/#/admin/flows/${FLOW}`);
    await page.locator('.tabs .tab').first().waitFor();
    const n = await page.locator('.tabs .tab').count();
    let ref = '';
    for (let i = 0; i < n; i++) {
      await page.locator('.tabs .tab').nth(i).click();
      await page.evaluate(() => window.scrollTo(0, 0));
      const now = JSON.stringify([await boxes('.page-header'), await boxes('.tabs'), await boxes('.tabs .tab'), await boxes('.tab-panel')].map((b, k) => (k === 3 ? b.map((x) => x.split(',').slice(0, 3).join(',')) : b)));
      if (i === 0) ref = now;
      expect(now, `editor tab #${i}`).toBe(ref);
      if (process.env.SHOTS && i < 3) await page.screenshot({ path: `${process.env.SHOTS}/editor-tab${i}.png` });
    }
    // run result: preview tabs stay put and the page does not jump
    await page.goto(`${BASE}/#/`);
    await page.goto(`${BASE}/#/run/${FLOW}`);
    await page.getByLabel('Tháng').selectOption('11');
    await page.locator('.input-block').first().locator('input[type=file]').setInputFiles({ name: 'luong.xlsx', mimeType: 'application/octet-stream', buffer: await salaryXlsx(EMPS) });
    await page.getByText(/3 dòng · sheet/).waitFor();
    // ledger warning must be confirmed (a ledger exists but none chosen)
    await page.locator('.alert .check input').first().check();
    await page.getByRole('button', { name: 'Tính' }).click();
    await page.getByText('Kết quả — kỳ 2026-11').waitFor();
    const rtabs = page.locator('.result-card .tabs .tab');
    await rtabs.first().scrollIntoViewIfNeeded();
    const scrollY = await page.evaluate(() => window.scrollY);
    let rref = '';
    for (let i = 0; i < (await rtabs.count()); i++) {
      await rtabs.nth(i).click();
      expect(await page.evaluate(() => window.scrollY), `scroll on result tab #${i}`).toBe(scrollY);
      const now = JSON.stringify([await boxes('.result-card .tabs'), await boxes('.result-card .tabs .tab'), await boxes('.run-side .card')]);
      if (i === 0) rref = now;
      expect(now, `result tab #${i}`).toBe(rref);
    }
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/run-result.png`, fullPage: true });
    // sidebar items stay put across pages
    let nref = '';
    for (const h of ['#/', '#/admin/flows', '#/admin/masters', '#/admin/users', '#/admin/backup', '#/account']) {
      await page.goto(`${BASE}/${h}`);
      await page.locator('.page-header').first().waitFor();
      const now = JSON.stringify([await boxes('.nav-item'), await boxes('.brand'), await boxes('.sidebar-foot'), (await boxes('.page-header')).map((b) => b.split(',').slice(0, 3).join(','))]);
      if (!nref) nref = now;
      expect(now, `page ${h}`).toBe(nref);
      if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/page-${h.replace(/[#/]/g, '') || 'home'}.png` });
    }
  });

  it('no request carries payroll rows, and nothing goes to another origin', async () => {
    const origin = new URL(BASE).origin;
    expect(requests.filter((r) => !r.url.startsWith(origin) && !r.url.startsWith('blob:') && !r.url.startsWith('data:'))).toEqual([]);
    const bodies = requests.filter((r) => r.body).map((r) => `${r.method} ${new URL(r.url).pathname} ${r.body}`);
    for (const needle of ['0022', '0101', 'Bình', '10000000', '18000000', '1050000']) expect(bodies.filter((b) => b.includes(needle))).toEqual([]);
    const paths = new Set(requests.filter((r) => r.method !== 'GET').map((r) => new URL(r.url).pathname));
    expect([...paths].sort()).toEqual(
      ['/api/flows', `/api/flows/${FLOW}/draft`, `/api/flows/${FLOW}/publish`, `/api/ledger-marks/e2e${RUN}`, '/api/login', '/api/masters/CostCenter', '/api/masters/Params', '/api/runs'].sort(),
    );
  });

  it('reloading leaves no payroll data in the page or browser storage', async () => {
    await page.goto(`${BASE}/#/`);
    await page.reload();
    await page.getByText('Chọn flow để chạy').waitFor();
    const storage = await page.evaluate(async () => ({
      local: localStorage.length,
      session: sessionStorage.length,
      idb: (await indexedDB.databases()).length,
      text: document.body.innerText,
    }));
    expect(storage.local).toBe(0);
    expect(storage.session).toBe(0);
    expect(storage.idb).toBe(0);
    expect(storage.text).not.toContain('0022');
  });

  it('a user account cannot reach admin screens', async () => {
    const u = `e2e${RUN}`;
    expect((await api('POST', '/api/users', { username: u, display_name: 'E2E', role: 'user', password: 'TempPass1234' })).status).toBe(201);
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.goto(BASE);
    await p.getByLabel('Tên đăng nhập').fill(u);
    await p.getByLabel('Mật khẩu').fill('TempPass1234');
    await p.getByRole('button', { name: 'Đăng nhập' }).click();
    await p.getByText('Bạn cần đổi mật khẩu tạm').waitFor();
    await p.getByLabel('Mật khẩu hiện tại').fill('TempPass1234');
    await p.getByLabel('Mật khẩu mới (≥ 10 ký tự)').fill('UserPass56789');
    await p.getByLabel('Nhập lại mật khẩu mới').fill('UserPass56789');
    await p.getByRole('button', { name: 'Đổi mật khẩu' }).click();
    await p.getByText('Chọn flow để chạy').waitFor();
    expect(await p.getByRole('link', { name: 'Master data' }).count()).toBe(0);
    await p.goto(`${BASE}/#/admin/masters`);
    await p.getByText('Chỉ admin được vào trang này.').waitFor();
    const r = await p.evaluate(async () => (await fetch('/api/masters/Params', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"columns":["key"],"rows":[]}' })).status);
    expect(r).toBe(403);
    await ctx.close();
  });

  it('no CSP violation or page error happened', () => {
    expect(problems.join('\n')).toBe('');
  });
});
