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
    for (const t of Object.values(masters))
      expect((await api('PUT', `/api/masters/${t.name}`, { columns: t.columns, rows: t.rows, effectiveFrom: '2000-01' })).status).toBe(200);
    await page.goto(`${BASE}/#/admin/masters`);
    await page.getByRole('button', { name: /^CostCenter/ }).click();
    await page.getByText(/^3 dòng · 6 cột/).waitFor();
  });

  it('saving a master table adds a version from a period; older periods keep the old one', async () => {
    const name = `E2E${RUN}`;
    expect((await api('PUT', `/api/masters/${name}`, { columns: ['key', 'value'], rows: [['A', 1]], effectiveFrom: '2000-01' })).status).toBe(200);
    await page.goto(`${BASE}/#/`);
    await page.goto(`${BASE}/#/admin/masters`);
    await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
    await page.locator('table.grid.edit tbody tr').first().locator('input.cell').nth(1).fill('2');
    await page.getByRole('button', { name: 'Lưu phiên bản mới' }).click();
    await page.getByLabel('Hiệu lực từ tháng').selectOption('1');
    await page.getByLabel('Hiệu lực từ năm').fill('2027');
    await page.getByLabel('Ghi chú thay đổi').fill('giá trị mới');
    // the preview shows how the old version is closed
    await page.locator('.effect-preview').getByText('v1 sẽ chỉ còn hiệu lực đến 12/2026.').waitFor();
    await page.locator('.modal').getByRole('button', { name: 'Lưu phiên bản mới' }).click();
    await page.getByText(/Đã lưu .* v2, hiệu lực từ 01\/2027/).waitFor();
    await page.locator('table.versions').getByText('giá trị mới').waitFor();
    const at = async (period: string) =>
      (await api('GET', `/api/masters?period=${period}`)).json.tables.find((t: { name: string }) => t.name === name) as { version: number; rows: unknown[][] };
    expect((await at('2026-12')).rows).toEqual([['A', 1]]);
    expect((await at('2027-01')).rows).toEqual([['A', 2]]);
    // cancelling v2 brings v1 back for 2027; restoring undoes it; nothing is deleted
    expect((await api('POST', `/api/masters/${name}/versions/2`, { action: 'cancel' })).status).toBe(200);
    expect((await at('2027-01')).version).toBe(1);
    expect((await api('POST', `/api/masters/${name}/versions/2`, { action: 'restore' })).status).toBe(200);
    expect((await at('2027-01')).version).toBe(2);
    expect((await api('PUT', `/api/masters/${name}`, { columns: ['key'], rows: [] })).status).toBe(400);
    expect((await api('DELETE', `/api/masters/${name}`)).status).toBe(200);
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
    const f = page.locator('table.ge tbody tr[data-row="2"] .formula textarea');
    await f.fill('[ins] + FOO(1)');
    await page.locator('.formula .ferr').getByText('tham chiếu tới cột đứng sau').first().waitFor();
    await page.locator('.formula .ferr').getByText('Hàm không hỗ trợ: FOO').first().waitFor();
    expect(await page.getByRole('button', { name: 'Publish' }).isDisabled()).toBe(true);
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/editor-error.png`, fullPage: false });
    // server refuses too
    await page.getByRole('button', { name: 'Lưu nháp' }).click();
    await page.getByText(/Đã lưu nháp. Còn \d+ lỗi/).waitFor();
    const refused = await api('POST', `/api/flows/${FLOW}/publish`, { effectiveFrom: '2000-01' });
    expect(refused.status).toBe(400);
    expect(JSON.stringify(refused.json)).toContain('FOO');

    await f.fill('SUMOF(in.SalaryTable.basic)');
    await page.getByRole('button', { name: 'Publish' }).click();
    // publish asks for the first payroll period; v1 applies from the beginning
    await page.getByLabel('Hiệu lực từ tháng').selectOption('1');
    await page.getByLabel('Hiệu lực từ năm').fill('2000');
    await page.locator('.modal').getByRole('button', { name: 'Publish' }).click();
    await page.getByText('Đang sửa từ: phiên bản v1 (hiện hành)').waitFor();
  });

  it('flow editor: overview, sample values next to each formula, keyboard reorder, print preview', async () => {
    await page.goto(`${BASE}/#/`);
    await page.goto(`${BASE}/#/admin/flows/${FLOW}`);
    await page.reload(); // no toasts left from earlier tests
    await page.getByText('Flow này chạy thế nào').waitFor();
    await page.getByRole('button', { name: 'Nạp dữ liệu mẫu' }).click();
    await page.locator('.sample-bar input[type=file]').first().setInputFiles({ name: 'luong.xlsx', mimeType: 'application/octet-stream', buffer: await salaryXlsx(EMPS) });
    await page.locator('.sample-bar').getByText(/^3 nhân viên/).waitFor();
    await page.locator('.ov-node').getByText('3 nhân viên').waitFor();
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/editor-overview.png`, fullPage: true });

    // employee table: value of the chosen employee and the total, live after an edit
    await page.getByRole('tab', { name: /^Bảng nhân viên/ }).click();
    const basic = page.locator('table.ge tbody tr[data-row="2"]');
    await basic.locator('.sv-main').getByText('10,000,000').waitFor();
    await basic.locator('.sv-total').getByText('Σ 30,000,000').waitFor();
    await page.getByLabel('Nhân viên mẫu').selectOption('0200');
    await basic.locator('.sv-main').getByText('12,000,000').waitFor();
    await basic.locator('.formula textarea').fill('SUMOF(in.SalaryTable.basic) * 2');
    await basic.locator('.sv-main').getByText('24,000,000').waitFor();
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/editor-sample.png`, fullPage: true });
    await basic.locator('.formula textarea').fill('SUMOF(in.SalaryTable.basic)');

    // reorder with the keyboard on the drag handle
    const label = (i: number) => page.locator(`table.ge tbody tr[data-row="${i}"] td`).nth(3).locator('input');
    expect(await label(4).inputValue()).toBe('Phụ cấp');
    await page.locator('table.ge tbody tr[data-row="4"] .grid-handle').press('ArrowUp');
    expect(await label(3).inputValue()).toBe('Phụ cấp');
    await page.locator('table.ge tbody tr[data-row="3"] .grid-handle').press('ArrowDown');
    expect(await label(4).inputValue()).toBe('Phụ cấp');

    // checks show their result on the sample
    await page.getByRole('tab', { name: /^Kiểm tra/ }).click();
    await page.locator('table.ge tbody tr[data-row="0"]').getByText('✓ đạt').waitFor();

    // form: print preview with the sample rows; a header click opens that column
    await page.getByRole('tab', { name: /^Form 02/ }).click();
    expect(await page.locator('.fp-table tbody tr').count()).toBeGreaterThan(0);
    expect(await page.locator('.fp-title').innerText()).not.toContain('{');
    await page.locator('.fp-table th', { hasText: 'Thực trích' }).click();
    await page.locator('table.ge tr.ge-flash').waitFor();
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/editor-form-preview.png`, fullPage: true });
  });

  it('quick start: a new empty flow is configured from a sample payroll file', async () => {
    const id = `Q${RUN}`;
    await page.goto(`${BASE}/#/admin/flows`);
    await page.reload();
    await page.getByLabel('Mã flow (A-Z, 0-9, _)').fill(id);
    await page.getByRole('button', { name: 'Tạo (thành bản nháp)' }).click();
    await page.getByText('Bắt đầu nhanh từ một file lương').waitFor();
    await page.getByRole('button', { name: 'Chọn file lương mẫu' }).click();
    await page.locator('.modal input[type=file]').setInputFiles({ name: 'luong.xlsx', mimeType: 'application/octet-stream', buffer: await salaryXlsx(EMPS) });
    await page.locator('.modal').getByText(/tiêu đề ở dòng 3/).waitFor();
    // roles are guessed from the headers
    expect(await page.getByLabel('Vai trò cột Mã NV').inputValue()).toBe('key');
    expect(await page.getByLabel('Vai trò cột Họ').inputValue()).toBe('name');
    expect(await page.getByLabel('Vai trò cột Đơn vị').inputValue()).toBe('unit');
    await page.getByLabel('Vai trò cột Lương thời gian').selectOption('amount');
    await page.getByLabel('Vai trò cột Phụ cấp').selectOption('amount');
    await page.getByLabel('Helper của Lương thời gian').fill('0301_LT');
    await page.getByLabel('Cost code của Lương thời gian').fill('0301');
    expect(await page.locator('.modal').getByRole('button', { name: 'Tạo cấu hình' }).isDisabled()).toBe(true); // no budget yet
    await page.getByLabel('Budget mặc định cho mọi khoản').fill('HR');
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/quick-start.png`, fullPage: true });
    await page.locator('.modal').getByRole('button', { name: 'Tạo cấu hình' }).click();
    // the same file becomes the sample data: values at once, configuration valid
    await page.locator('.sample-bar').getByText(/^3 nhân viên/).waitFor();
    await page.locator('.ov-node').getByText('2 cost item').waitFor();
    // one cost code left blank: the overview says what to do next and opens the row
    await page.locator('.ov-next').getByText('Thiếu Cost Code').waitFor();
    await page.locator('.ov-next').getByRole('button', { name: /^Mở bước/ }).click();
    await page.locator('table.ge tr.ge-flash[data-row="1"]').waitFor();
    await page.locator('table.ge tbody tr[data-row="1"] td').nth(3).locator('input').fill('0319');
    await page.locator('.editor-status .pill-ok').getByText('hợp lệ').waitFor();
    await page.locator('.sample-bar').getByText(/3 dòng tổng hợp/).waitFor();
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/quick-start-done.png`, fullPage: true });
    await page.getByRole('button', { name: 'Lưu nháp' }).click();
    await page.getByText('Đã lưu nháp. Không có lỗi cấu hình.').waitFor();
    const draft = (await api('GET', `/api/flows/${id}`)).json.draft.config;
    expect(draft.costItems.map((c: { helper: string; budget: string; amount: string }) => `${c.helper}:${c.budget}:${c.amount}`)).toEqual(['0301_LT:HR:luong_thoi_gian', 'PHU_CAP:HR:phu_cap']);
    expect(draft.inputs[0].key).toBe('ma_nv');
  });

  it('versions are effective-dated: each period runs the version in force for it', async () => {
    const v1 = (await api('GET', `/api/flows/${FLOW}/versions/1`)).json.config;
    expect((await api('PUT', `/api/flows/${FLOW}/draft`, { config: { ...v1, fileName: 'X_{MM}.xlsx' } })).status).toBe(200);
    expect((await api('POST', `/api/flows/${FLOW}/publish`, {})).status).toBe(400); // no effective period
    expect((await api('POST', `/api/flows/${FLOW}/publish`, { effectiveFrom: '2026-12', note: 'tên file mới' })).json.version).toBe(2);
    // roll back from 2027: v1's config again, as v3
    expect((await api('POST', `/api/flows/${FLOW}/publish`, { fromVersion: 1, effectiveFrom: '2027-01' })).json.version).toBe(3);
    const eff = async (period: string) => (await api('GET', `/api/flows/${FLOW}/effective?period=${period}`)).json.effective;
    expect((await eff('2026-11')).version).toBe(1);
    expect((await eff('2026-12')).version).toBe(2);
    expect((await eff('2026-12')).config.fileName).toBe('X_{MM}.xlsx');
    expect((await eff('2027-01')).version).toBe(3);
    expect((await eff('2027-01')).config).toEqual(v1);
    // cancel v2: December falls back to v1; restore it; the version list keeps all three
    expect((await api('POST', `/api/flows/${FLOW}/versions/2`, { action: 'cancel' })).status).toBe(200);
    expect((await eff('2026-12')).version).toBe(1);
    expect((await api('POST', `/api/flows/${FLOW}/versions/2`, { action: 'restore' })).status).toBe(200);
    expect((await api('GET', `/api/flows/${FLOW}`)).json.versions.map((v: { version: number; state: string }) => `${v.version}:${v.state}`)).toEqual([
      '3:future',
      '2:future',
      '1:current',
    ]);

    await page.goto(`${BASE}/#/`);
    await page.goto(`${BASE}/#/admin/flows/${FLOW}`);
    await page.getByRole('tab', { name: 'Phiên bản' }).click();
    await page.locator('table.versions').getByText('từ đầu → 11/2026').waitFor();
    await page.locator('table.versions').getByText('tên file mới').waitFor();
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/versions.png`, fullPage: true });

    // the run page follows the period chosen
    await page.goto(`${BASE}/#/run/${FLOW}`);
    await page.getByLabel('Năm').fill('2026');
    await page.getByLabel('Tháng').selectOption('12');
    await page.getByText('v2 · hiệu lực 12/2026 → 12/2026').first().waitFor();
    await page.getByLabel('Tháng').selectOption('11');
    await page.getByText('v1 · hiệu lực từ đầu → 11/2026').first().waitFor();
  });

  let ledger1 = '';
  let ledger2 = '';
  it('runs the flow end to end and downloads Form 02/03 + ledger', async () => {
    await page.goto(`${BASE}/#/run/${FLOW}`);
    await page.getByLabel('Tháng').selectOption('9');
    await page.getByLabel('Năm').fill('2026');
    await page.getByLabel('Người lập').fill('Nguyễn Văn A');
    // a two-stage flow asks for the stage first; nothing is preselected
    expect(await page.getByRole('radio', { checked: true }).count()).toBe(0);
    await page.getByRole('radio', { name: /^Trích \+ Chi/ }).click();
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
    await page.getByRole('radio', { name: /^Trích \+ Chi/ }).click();
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
    ledger2 = (await downloadsOf(2, () => page.getByRole('button', { name: 'Tải Form + Ledger' }).click())).find((p) => p.includes('Ledger_'))!;

    // using the period-09 ledger again is now stale
    await page.goto(`${BASE}/#/`);
    await page.goto(`${BASE}/#/run/${FLOW}`);
    await page.locator('.input-block').nth(1).locator('input[type=file]').setInputFiles(ledger1);
    await page.getByText('không phải bản mới nhất').waitFor();
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/stale-ledger.png`, fullPage: true });
    expect(await page.getByRole('button', { name: 'Tính' }).isDisabled()).toBe(true);
  });

  it('the sidebar highlights exactly one item', async () => {
    for (const [h, label] of [
      ['#/', 'Chạy'],
      [`#/run/${FLOW}`, 'Chạy'],
      ['#/run-file', 'JSON'],
      ['#/admin/flows', 'Flows'],
    ] as const) {
      await page.goto(`${BASE}/${h}`);
      await page.locator('.page-header').first().waitFor();
      const active = await page.locator('.nav-item.active').allTextContents();
      expect(active.length, h).toBe(1);
      expect(active[0], h).toContain(label);
    }
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
      await page.evaluate(() => document.querySelector('.content')!.scrollTo(0, 0));
      const now = JSON.stringify([await boxes('.page-header'), await boxes('.tabs'), await boxes('.tabs .tab'), await boxes('.tab-panel')].map((b, k) => (k === 3 ? b.map((x) => x.split(',').slice(0, 3).join(',')) : b)));
      if (i === 0) ref = now;
      expect(now, `editor tab #${i}`).toBe(ref);
      if (process.env.SHOTS && i < 3) await page.screenshot({ path: `${process.env.SHOTS}/editor-tab${i}.png` });
    }
    // run result: preview tabs stay put and the page does not jump
    await page.goto(`${BASE}/#/`);
    await page.goto(`${BASE}/#/run/${FLOW}`);
    await page.getByLabel('Tháng').selectOption('11');
    await page.getByRole('radio', { name: /^Trích \+ Chi/ }).click();
    await page.locator('.input-block').first().locator('input[type=file]').setInputFiles({ name: 'luong.xlsx', mimeType: 'application/octet-stream', buffer: await salaryXlsx(EMPS) });
    await page.getByText(/3 dòng · sheet/).waitFor();
    // ledger warning must be confirmed (a ledger exists but none chosen)
    await page.locator('.alert .check input').first().check();
    await page.getByRole('button', { name: 'Tính' }).click();
    await page.getByText('Kết quả — kỳ 2026-11').waitFor();
    const rtabs = page.locator('.result-card .tabs .tab');
    await rtabs.first().scrollIntoViewIfNeeded();
    // the page body scrolls inside the page card (.content), not the window
    const scrollTop = () => page.evaluate(() => document.querySelector('.content')!.scrollTop);
    const scrollY = await scrollTop();
    let rref = '';
    for (let i = 0; i < (await rtabs.count()); i++) {
      await rtabs.nth(i).click();
      expect(await scrollTop(), `scroll on result tab #${i}`).toBe(scrollY);
      const now = JSON.stringify([await boxes('.result-card .tabs'), await boxes('.result-card .tabs .tab'), await boxes('.run-side .card')]);
      if (i === 0) rref = now;
      expect(now, `result tab #${i}`).toBe(rref);
    }
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/run-result.png`, fullPage: true });
    // sidebar items stay put across pages
    let nref = '';
    for (const h of ['#/', '#/admin/flows', '#/admin/masters', '#/admin/users', '#/admin/backup', '#/admin/help', '#/account']) {
      await page.goto(`${BASE}/${h}`);
      await page.locator('.page-header').first().waitFor();
      const now = JSON.stringify([await boxes('.nav-item'), await boxes('.brand'), await boxes('.sidebar-foot'), (await boxes('.page-header')).map((b) => b.split(',').slice(0, 3).join(','))]);
      if (!nref) nref = now;
      expect(now, `page ${h}`).toBe(nref);
      if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/page-${h.replace(/[#/]/g, '') || 'home'}.png` });
    }
  });

  it('accrual run, then the payment run days later: Form 02, then Form 03; the ledger keeps the accrual', async () => {
    const sheets = async (file: string) => {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(readFileSync(file) as unknown as ArrayBuffer);
      return wb;
    };
    const run = async (stage: RegExp, ledgerFile: string) => {
      await page.goto(`${BASE}/#/`);
      await page.goto(`${BASE}/#/run/${FLOW}`);
      await page.getByLabel('Năm').fill('2026');
      await page.getByLabel('Tháng').selectOption('11');
      await page.getByLabel('Người lập').fill('Nguyễn Văn A');
      await page.locator('.input-block').first().locator('input[type=file]').setInputFiles({ name: 'luong.xlsx', mimeType: 'application/octet-stream', buffer: await salaryXlsx(EMPS) });
      await page.locator('.input-block').nth(1).locator('input[type=file]').setInputFiles(ledgerFile);
      await page.getByText(/dòng trích/).waitFor();
      expect(await page.getByRole('button', { name: 'Tính' }).isDisabled()).toBe(true); // stage not chosen yet
      await page.getByRole('radio', { name: stage }).click();
      expect(await page.getByText('Thay thế dữ liệu cũ của kỳ này').count()).toBe(0);
      await page.getByRole('button', { name: 'Tính' }).click();
      await page.getByText('Kết quả — kỳ 2026-11').waitFor();
      return downloadsOf(2, () => page.getByRole('button', { name: 'Tải Form + Ledger' }).click());
    };
    const acc = await run(/^Trích ·/, ledger2);
    const accForm = acc.find((p) => p.includes('Form_'))!;
    expect(accForm).toMatch(/_Trich\.xlsx$/);
    expect((await sheets(accForm)).worksheets.map((w) => w.name)).toEqual(['Form 02']);
    const accLedger = acc.find((p) => p.includes('Ledger_'))!;
    const rows = (wb: ExcelJS.Workbook, sheet: string) => {
      const out: string[] = [];
      wb.getWorksheet(sheet)!.eachRow((r, i) => i > 1 && String(r.getCell(1).value) === '2026-11' && out.push(String(r.getCell(9).value)));
      return out;
    };
    const l1 = await sheets(accLedger);
    expect(rows(l1, 'accrual').length).toBeGreaterThan(0);
    expect(rows(l1, 'actual').length).toBe(0);

    const pay = await run(/^Chi ·/, accLedger);
    const payForm = pay.find((p) => p.includes('Form_'))!;
    expect(payForm).toMatch(/_Chi\.xlsx$/);
    expect((await sheets(payForm)).worksheets.map((w) => w.name)).toEqual(['Form 03']);
    const l2 = await sheets(pay.find((p) => p.includes('Ledger_'))!);
    expect(rows(l2, 'accrual')).toEqual(rows(l1, 'accrual'));
    expect(rows(l2, 'actual').length).toBeGreaterThan(0);
  });

  it('no request carries payroll rows, and nothing goes to another origin', async () => {
    const origin = new URL(BASE).origin;
    expect(requests.filter((r) => !r.url.startsWith(origin) && !r.url.startsWith('blob:') && !r.url.startsWith('data:'))).toEqual([]);
    const bodies = requests.filter((r) => r.body).map((r) => `${r.method} ${new URL(r.url).pathname} ${r.body}`);
    for (const needle of ['0022', '0101', 'Bình', '10000000', '18000000', '1050000']) expect(bodies.filter((b) => b.includes(needle))).toEqual([]);
    const paths = new Set(requests.filter((r) => r.method !== 'GET').map((r) => new URL(r.url).pathname));
    expect([...paths].sort()).toEqual(
      [
        '/api/flows',
        `/api/flows/${FLOW}/draft`,
        `/api/flows/Q${RUN}/draft`,
        `/api/flows/${FLOW}/publish`,
        `/api/flows/${FLOW}/versions/2`,
        `/api/ledger-marks/e2e${RUN}`,
        '/api/login',
        '/api/masters/CostCenter',
        '/api/masters/Params',
        `/api/masters/E2E${RUN}`,
        `/api/masters/E2E${RUN}/versions/2`,
        '/api/runs',
      ].sort(),
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

  it('admin edits interface texts in place; other users see them; reset restores the default', async () => {
    const title = `Chạy lương kỳ này ${RUN}`;
    for (const k of ['home.title', 'home.guide']) await api('DELETE', `/api/ui-texts/${k}`);
    await page.goto(`${BASE}/#/`);
    await page.reload();
    const h1 = page.locator('.page-header h1');
    await h1.getByText('Chọn flow để chạy').waitFor();
    const before = await h1.boundingBox();
    await page.getByRole('button', { name: 'Chỉnh sửa giao diện', exact: true }).click();
    await page.locator('.edit-bar').waitFor();
    // edit mode only adds an outline: the title does not move
    expect(await h1.boundingBox()).toEqual(before);

    // a sidebar item edits its label wherever it is clicked (the active item looks like one big button)
    const item = page.locator('.nav-item').first();
    const box = (await item.boundingBox())!;
    await page.mouse.click(box.x + box.width - 6, box.y + box.height / 2);
    await page.locator('.text-editor-head code').getByText('nav.run').waitFor();
    await page.keyboard.press('Escape');
    expect(await page.locator('.text-editor').count()).toBe(0);

    await page.locator('[data-text-key="home.title"]').click();
    await page.getByLabel('Nội dung').fill(title);
    await page.getByLabel('Nội dung').press('Enter');
    await h1.getByText(title).waitFor();
    await page.locator('[data-text-key="home.guide"]').click();
    await page.getByLabel('Nội dung').fill('Quy trình hằng tháng:\n- Tải file lương\n- Kiểm tra trước khi tải');
    await page.getByLabel('Nội dung').press('Control+Enter');
    await page.locator('.guide li').getByText('Tải file lương').waitFor();
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/texts-edit.png`, fullPage: true });
    await page.locator('.edit-bar').getByRole('button', { name: 'Xong' }).click();
    expect(await page.locator('.ui-text').count()).toBe(0);

    // the user account created above sees the new texts
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.goto(BASE);
    await p.getByLabel('Tên đăng nhập').fill(`e2e${RUN}`);
    await p.getByLabel('Mật khẩu').fill('UserPass56789');
    await p.getByRole('button', { name: 'Đăng nhập' }).click();
    await p.locator('.page-header h1').getByText(title).waitFor();
    await p.locator('.guide').getByText('Kiểm tra trước khi tải').waitFor();
    expect(await p.getByRole('button', { name: 'Chỉnh sửa giao diện', exact: true }).count()).toBe(0);
    await ctx.close();

    // reset from Admin › Giao diện
    await page.goto(`${BASE}/#/admin/texts`);
    for (const k of ['home.title', 'home.guide']) await page.locator('tr', { hasText: k }).getByRole('button', { name: 'Khôi phục mặc định' }).click();
    // only the texts this test changed are checked (other overrides may exist in a shared database)
    await expect.poll(() => page.locator('table.grid tr', { hasText: /home\.(title|guide)/ }).count()).toBe(0);
    await page.goto(`${BASE}/#/`);
    await h1.getByText('Chọn flow để chạy').waitFor();
    expect(await page.locator('.guide').count()).toBe(0);
  });

  it('admin replaces any text on screen (not data); reset brings it back', async () => {
    const heading = page.getByRole('heading', { name: 'Thao tác trên bảng' });
    const replaced = `Cách dùng bảng ${RUN}`;
    await page.goto(`${BASE}/#/admin/help`);
    await page.reload();
    await page.getByRole('button', { name: 'Chỉnh sửa giao diện', exact: true }).click();
    await page.locator('.edit-bar').waitFor();
    // (the heading is full width: point at its first letters)
    await heading.hover({ position: { x: 12, y: 10 } });
    await page.locator('.lit-hover').waitFor();
    await heading.click({ position: { x: 12, y: 10 } });
    await page.locator('.text-editor-head').getByText('áp dụng cho mọi chỗ có đúng chữ này').waitFor();
    await page.getByLabel('Nội dung').fill(replaced);
    await page.getByLabel('Nội dung').press('Enter');
    await page.getByRole('heading', { name: replaced }).waitFor();
    // data (a user's name in the sidebar) is not offered for editing
    await page.locator('.user-name').hover();
    await expect.poll(() => page.locator('.lit-hover').count()).toBe(0);
    await page.locator('.edit-bar').getByRole('button', { name: 'Xong' }).click();
    // saved for everyone: still there after a reload
    await page.reload();
    await page.getByRole('heading', { name: replaced }).waitFor();
    await page.goto(`${BASE}/#/admin/texts`);
    await page.locator('tr', { hasText: 'Thao tác trên bảng' }).getByRole('button', { name: 'Khôi phục mặc định' }).click();
    await expect.poll(() => page.locator('tr', { hasText: replaced }).count()).toBe(0);
    await page.goto(`${BASE}/#/admin/help`);
    await heading.waitFor();
  });

  it('light / dark mode: the choice applies at once and survives a reload', async () => {
    await page.goto(`${BASE}/#/account`);
    const theme = () => page.evaluate(() => [document.documentElement.getAttribute('data-theme'), getComputedStyle(document.body).backgroundColor]);
    await page.getByRole('radio', { name: /Tối/ }).click();
    expect(await theme()).toEqual(['dark', 'rgb(25, 25, 25)']);
    await page.reload();
    await page.locator('.theme-picker').waitFor();
    expect(await theme()).toEqual(['dark', 'rgb(25, 25, 25)']);
    await page.getByRole('radio', { name: /Sáng/ }).click();
    expect(await theme()).toEqual(['light', 'rgb(249, 249, 249)']);
    // the sidebar button cycles light → dark → system
    await page.getByRole('button', { name: /Chế độ màu/ }).click();
    expect((await theme())[0]).toBe('dark');
    await page.getByRole('button', { name: /Chế độ màu/ }).click();
    expect((await theme())[0]).toBeNull();
  });

  it('no CSP violation or page error happened', () => {
    expect(problems.join('\n')).toBe('');
  });
});
