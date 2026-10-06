# C&B Form Webapp — Implementation Plan

Replaces five Excel/Power Query/VBA workbooks used by the C&B team to turn payroll-system exports into
**Form 02 (accrual / "Trích")** and **Form 03 (payment / "Chi")** Excel files that are sent to Accounting (AC).

The app is a **configurable framework**, not five hard-coded calculators. An admin configures flows; users run them.

Reference material (put in `/reference`, read-only, never deployed):
`001 HQ`, `002 SL`, `003 IN`, `004 OI`, `005 QHY` `.xlsm` workbooks and the four `.m` files from
`github.com/izark99/m-query` (`hq_calculation.m`, `sl_form02.m`, `oi_form03.m`, `qhy_accrual.m`).
These are the source of truth for the seed configuration in Phase 5.

---

## 1. Decisions already made (do not re-open)

| # | Decision |
|---|---|
| D1 | One app, five flows (HQ, SL, IN, OI, QHY). All behaviour comes from admin configuration. |
| D2 | **All payroll data is processed in the browser.** The server stores settings only. No employee row, no amount, ever leaves the browser. |
| D3 | Hosting: Cloudflare Pages + Pages Functions + D1, free tier only. |
| D4 | Roles: `admin` (configure everything) and `user` (run flows). 1 admin, 4–5 users. No per-flow permissions. |
| D5 | Input: `.xlsx` exports. Column names and order may change → mapping by configurable header aliases, fixable by the user at run time. |
| D6 | Output: `.xlsx` in the exact print layout. No PDF, no ERP integration. |
| D7 | Period-over-period adjustment ("Adjusted amount last period") applies to **all flows that accrue: HQ, SL, IN, OI and QHY**, using the SL logic. |
| D8 | History is **not stored on the server**. The user uploads a ledger file each run and downloads the updated one. |
| D9 | Form 01 logic is written by the admin as **Excel-like formulas** per column. |
| D10 | Validation failures are reported as errors; no manual per-row override in the app. Fix the source data and re-run. |
| D11 | Master data is editable in a grid **and** by xlsx import/export. |
| D12 | All hard-coded exceptions in today's formulas (position codes, unit codes, employee lists, rates, caps) become configuration. |
| D13 | Opening balances are zero for every flow at go-live. |
| D14 | Form 03 columns whose total is zero are hidden in the output. |
| D15 | Free-text header fields (e.g. "Đơn vị", signing date) are typed by the user at run time; no stored group list. |
| D16 | One shared ledger for all five flows. A flow adjusts only the cost items it accrues (`accrue = true` in that flow). |
| D17 | A failing check of level `error` blocks export; the admin can set a check to `warning`. |
| D18 | Login with **username + password accounts created by the admin**. No self-registration, no third-party login. |
| D19 | Every code in the workbooks (cost codes, helpers, budget codes, unit and position codes, rates) is **sample data**. Nothing of the kind may appear in application code; the admin configures all of it. |

## 2. Open point for the owner

- **IN payment side.** IN now adjusts like the other flows, so the ledger needs an "actual" amount for the
  insurance and trade-union cost items. The workbook has no payment form for IN. The engine lets the admin
  choose which form and column feed the ledger's `actual` sheet (section 5.6); the owner must decide what that
  is for IN (e.g. the amount actually remitted). Until it is configured, IN's balance equals minus its
  accruals and the adjustment would be wrong — so IN's `adjust` stays off in the seed until this is set.

## 3. Architecture

```
Browser (SPA)                                   Cloudflare
┌──────────────────────────────────────┐        ┌───────────────────────────┐
│ xlsx parse → engine → xlsx export    │  JSON  │ Pages Functions  /api/*   │
│ (payroll data stays here, in memory) │◄──────►│ D1: users, config, masters│
└──────────────────────────────────────┘ config └───────────────────────────┘
                                          only        session-cookie login     
```

- **Frontend:** Vite + React + TypeScript. Static build on Pages.
- **Excel I/O:** ExcelJS for both reading and writing (it writes styles, merges, print setup; one library).
- **API:** Pages Functions, plain `fetch` handlers, D1 binding. No framework.
- **Auth:** username + password, accounts created by the admin (details in 3.1). Every API route except
  `/api/login` requires a valid session; every mutating config/user endpoint checks `role = admin` server-side.
- **Engine:** pure TypeScript module with no DOM or network dependency, so it is unit-testable in Node.

### 3.1 Authentication

- Passwords hashed with PBKDF2-HMAC-SHA256 via WebCrypto, 100,000 iterations (the Workers limit), 16-byte
  random salt per user, constant-time comparison. Never store or log plaintext.
- Session: 32-byte random token in a cookie `HttpOnly; Secure; SameSite=Strict; Path=/`; only its SHA-256 is
  stored in D1. Lifetime 12 hours, deleted on logout, all of a user's sessions deleted on password change,
  reset or deactivation.
- Admin creates a user with a temporary password; the user must change it at first login
  (`must_change_password`). Admin can reset a password and deactivate a user. Minimum length 10.
- Login throttling: after 5 failed attempts for a username, lock that username for 15 minutes
  (`failed_count`, `locked_until`). Same error message for unknown user and wrong password.
- First admin: created by a one-off script run with `wrangler d1 execute` (documented in the README), not by
  a public endpoint.
- Mutating requests require the `Origin` header to match the site (CSRF defence on top of `SameSite=Strict`).

### Privacy guardrails (enforce in code, verify in review)

- No API endpoint accepts row data or amounts. Request bodies are config, master tables, or run metadata only.
- `Content-Security-Policy: default-src 'self'; connect-src 'self'` — the page cannot post anywhere else.
- No analytics, no error-reporting service, no CDN scripts. All dependencies bundled.
- No `localStorage`/`IndexedDB` for payroll data. Uploaded data lives in memory and is gone on tab close.
- Formulas are evaluated by a hand-written parser. **Never `eval` or `new Function`.**

## 4. Data model (D1)

```sql
users(username TEXT PRIMARY KEY, display_name TEXT, role TEXT CHECK(role IN ('admin','user')),
      password_hash TEXT, password_salt TEXT, must_change_password INTEGER, active INTEGER,
      failed_count INTEGER, locked_until TEXT, created_at)
sessions(token_hash TEXT PRIMARY KEY, username TEXT, expires_at TEXT)
master_tables(name TEXT PRIMARY KEY, columns_json TEXT, rows_json TEXT, updated_by, updated_at)
flows(id TEXT PRIMARY KEY, name TEXT, sort INTEGER, active INTEGER)
flow_versions(id INTEGER PRIMARY KEY, flow_id, version INTEGER, config_json TEXT,
              status TEXT CHECK(status IN ('draft','published')), created_by, created_at)
ledger_marks(ledger TEXT PRIMARY KEY, last_period TEXT, file_hash TEXT, updated_by, updated_at)
run_log(id INTEGER PRIMARY KEY, flow_id, flow_version, period TEXT, user, at)
```

- `master_tables` are **global and shared by all flows** (today each workbook has its own copy of CostCenter).
  Scalar parameters (insurance rates, base salary, regional minimum wage, accrual percentages, divisors)
  live in a master table named `Params` (`key`, `value`).
- A flow's whole definition is one JSON document per version. Users always run the latest `published` version.
  Publishing never edits an old version (audit trail; rollback = publish an older one again).
- `ledger_marks` stores only a period and a SHA-256 hash. It holds no amounts. Purpose: section 7.
- `run_log` is metadata only (who ran which flow version for which period).

## 5. Flow configuration model

One JSON document per flow version. Sections:

### 5.1 `inputs[]` — files the user uploads
```
{ id: "SalaryTable", label, required, key: "emp_id",
  fields: [ { id: "emp_id", type: "text", required: true, aliases: ["Mã NV"] },
            { id: "time_salary", type: "number", aliases: ["Lương thời gian"] }, ... ] }
```
- Header row is auto-detected: the first row within the top 20 that matches the most aliases.
- Alias match is case-insensitive, whitespace-collapsed, newline-insensitive (headers today contain padding
  such as `"         Họ      "`).
- Unmatched required fields → the user picks the column manually in a mapping screen. An admin can save the
  picked header as a new alias; a user's pick lasts for that run only.
- Employee codes are **text** (leading zeros matter: `0022`).

### 5.2 `runParams[]` — values asked at run time
Month, year (always present) plus admin-defined ones: free text (header "Đơn vị", signer names, signing date)
or a pick from a master table (OI: which cost item this run is for).

### 5.3 `employeeTable` — replaces "Form 01"
```
{ source: "SalaryTable", rowFilter: "<formula>|null",
  columns: [ { id, label, formula, type, show } ... ] }   // evaluated in order
```
One row per distinct employee key in the source input. Each column is a formula (section 6).
Columns can reference earlier columns, inputs, master tables, `Params`, and run parameters.

### 5.4 `costItems[]` — what becomes rows of Form 02 / Form 03
```
{ helper: "0317Q_ST", costCode: "0317", nameVi: "Thưởng Doanh Số Quý", nameEn,
  periodType: "M|Q|H|Y", budget: "HR|AT|Opex|<literal code>",
  amount: "<employeeTable column id>", employeeAmount: "<column id>|null",   // IN: employee-side deduction
  accrue: true, pay: true }
```
- `budget`: if it names a column of the `CostCenter` master table (HR, AT, Opex) the Budget Code is looked up
  per unit; otherwise the literal is used (`HR1000`, `WH40100`). This mirrors the current
  "length > 4 = literal" trick without the trick.
- `accrue` / `pay` replace today's print-time filters ("drop helpers containing Q/H/Y", "drop 0401", "0314 only").

### 5.5 `aggregation`
- Group employee rows by Unit × Budget Code × Helper, sum, round to integer VND.
- Join Unit → `Dept`, `Cost Center`, `Sector` from `CostCenter`. `Sector` comes from a column in the master
  table (today: `SB/WH = "DHG"` → `DHG`, else `KBH`), not from code.
- `unitFilter` formula over `CostCenter` rows (SL: `SB/WH = "SB"`; HQ: `<> "SB"`; all: unit does not contain `Z`).
- Description template: `{prefix} {name}_{period}_{dept}-{unit}` where period is `T09.2026`, `Q03.2026`,
  `H02.2026` or the year, chosen by `periodType`. Prefix is `Trích` on Form 02 and `Chi` on Form 03 (configurable).
- Sort: Dept, Unit, Cost Center, Budget Code, Helper. Then number rows 1..n.

### 5.6 `forms.form02` and `forms.form03`
```
{ enabled, rowFilter: "<formula over the aggregated row>",
  adjust: true|false,                                   // section 7
  ledgerFeed: { sheet: "accrual|actual|none", amountColumn: "<column id>" },   // what this form writes to the ledger
  columns: [ { id, headerVi, headerEn, formula, hideIfZeroTotal } ... ],
  layout: { titleVi, titleEn, signatureBlock, ... } }   // section 8
```
Form 03's deduction columns (meal allowance, SI/HI/UI, PIT, union fees, loans, donations …) are per-row
formulas of the shape used today:
`IF(row.costCode IN ("0304","0319"), UNITSUM(emp.si), 0)` — "sum this employee column over the row's unit and
place it on the rows that satisfy this condition". The placement condition is admin-editable per column.
`Take-home pay` is an ordinary formula over the other columns.

### 5.7 `checks[]`
```
{ id, level: "error|warning", scope: "employee|form02|form03|total", formula, message }
```
Examples to seed: duplicate employee code; blank unit; unit missing from `CostCenter`; sum of cost-item
columns ≠ gross total of the input; allocated PIT ≠ total PIT; a unit that has both placement rows (double count).
Results screen lists every failing row with its key. Any `error` blocks export.

## 6. Formula language

Hand-written tokenizer + recursive-descent parser + evaluator. No dependency, no `eval`.

- Literals: numbers, `"strings"`, `TRUE`/`FALSE`.
- Operators: `+ - * /`, `= <> < <= > >=`, `&` (concat). Excel precedence.
- References: `[Column Id]` (earlier column, same row), `in.<input>.<field>`, `P.<key>` (Params),
  `run.month`, `run.year`, `run.<param>`, `row.<field>` (form scope).
- Functions (whitelist): `IF, IFS, AND, OR, NOT, IN, SWITCH, ROUND, ROUNDUP, ROUNDDOWN, MIN, MAX, ABS,
  SUM, LEFT, RIGHT, MID, LEN, TRIM, UPPER, VALUE, TEXT, ISNUMBER, ISBLANK, CONTAINS`,
  `FIRST(in.X.f)` / `SUMOF(in.X.f)` (value(s) of the current employee in input X; replaces XLOOKUP/SUMIFS by Mã NV),
  `LOOKUP(table, key, column, default)` and `LOOKUP2(table, rowKey, columnName, default)` (matrix tables such as Scheme),
  `UNITSUM(column)` (form scope only).
- **Rounding must match Excel**: half away from zero, including negatives (`Math.round` does not).
  Implement once, test with `ROUND(-2.5,0) = -3`, `ROUND(2.5,0) = 3`, `ROUND(1.005,2) = 1.01`.
- Blank/missing numeric → 0; blank text → `""`. Division by zero → error surfaced as a check failure, not `NaN`.
- Admin editor: validates on save (unknown reference, unknown function, wrong arity, circular or forward
  reference) and shows the error next to the column. A flow with formula errors cannot be published.

## 7. Ledger and adjustment (all flows)

**Ledger file** (`.xlsx`, kept by the team, one file shared by all five flows; every row also carries the `Flow` that wrote it):
- sheet `accrual`: Period, Sector, Dept, Unit, Budget Code, Cost Center, Cost Code, Helper, Accrual amount
  this period, Adjusted amount last period, Actual accrual amount this period
- sheet `actual`: Period, same keys, Salary fund (actual spending)
- sheet `_meta`: last period written, flow that wrote it, timestamp, SHA-256 of the data sheets

**Run logic** (port of `accumulated` + `sl_form02.m`), key = Unit, Budget Code, Cost Center, Cost Code, Helper:
1. Balance per key = Σ `actual` − Σ `Actual accrual amount this period`, over all ledger periods **before** the run period.
2. For Form 02 rows whose cost item has `accrue = true` in this flow (a bonus accrued in QHY and paid in SL is adjusted only in QHY): `Adjusted amount last period` = balance (0 if none);
   `Actual accrual amount this period` = Accrual this period + Adjusted.
3. Keys that have a non-zero balance but no accrual this period still produce a Form 02 row (accrual 0, adjusted ≠ 0).
4. Rows where both accrual and adjusted are 0 are dropped.
5. Updated ledger = old ledger + this period's rows, written to `accrual` / `actual` according to each form's `ledgerFeed`.

**Rules that protect the numbers** (this is the weak point of "no server-side history"):
- First run of a ledger: no file needed; the app starts from an empty ledger (D13).
- If the ledger already contains rows for this flow and period, ask: replace those rows, or cancel. Never duplicate.
- After export, the browser sends `{ledger, last_period, file_hash}` to `ledger_marks`. On the next upload, if
  the file's hash differs from the stored one, show a blocking warning naming who produced the latest ledger
  and when; the user must confirm to continue with an older file.
- The ledger download and the Form 02/03 download happen in one action so they cannot drift apart.
- Because the ledger is shared, two users must not run different flows from the same ledger copy at the same
  time: the hash check above catches the second one and makes them re-download the latest file first.
- IN: Form 02 keeps its extra column (employee deduction) and total payable; the adjustment is added once the
  owner defines IN's payment side (section 2).

## 8. Excel output

Built with ExcelJS from `forms.*.layout`; one workbook per run with sheets `Form 02`, `Form 03`
(plus the ledger as a separate file).

- Row 1 company name; title lines in Vietnamese and English from templates with run parameters
  (`BẢNG TỔNG HỢP TRÍCH LƯƠNG KHỐI BÁN HÀNG - THÁNG {MM}.{YYYY}`); optional free-text line ("Đơn vị: …").
- Two header rows: Vietnamese labels, then English labels. Then data, then a `Total` row with real `SUM`
  formulas so AC can re-check.
- Signature block under the table: place/date line and role titles, values typed by the user at run time.
- Number format `#,##0`; borders; column widths from config; landscape; fit to one page wide; header rows
  repeat on every printed page.
- Columns flagged `hideIfZeroTotal` are hidden (not deleted) when their total is 0.
- Values only in data cells — no formulas that depend on other sheets.
- File name template per flow, e.g. `Form02_SL_T09.2026.xlsx`.

Visual parity is checked by opening the generated file next to the current "Form 02 - Print" / "Form 03 - Print" sheets.

## 9. Screens

**User**
1. Home: list of flows, last run per flow (from `run_log`).
2. Run wizard: period and run parameters → upload inputs (+ ledger if the flow adjusts) → column mapping
   (only shown if something is unmapped) → compute → checks → preview tabs (Employee table, Form 02, Form 03,
   totals) → download.

**Admin**
3. Master tables: grid edit, add/delete rows and columns, xlsx import (replace or merge by key) and export.
4. Flow editor: tabs for Inputs, Run parameters, Employee columns (formula editor with reference
   autocomplete), Cost items, Form 02, Form 03, Checks, Layout. Save draft → Test run (the normal wizard
   against the draft) → Publish.
5. Versions: list, diff as JSON, re-publish an older one.
6. Config backup: export/import the whole configuration (flows + master tables) as one JSON file.
7. Users: create account with temporary password, set role, reset password, deactivate.

Everyone: login screen, forced password change at first login, change own password, logout.

UI language: Vietnamese labels, English code and identifiers.

## 10. Phases

Each phase ends deployable. Do not start a phase before the previous one's acceptance passes.

**Phase 0 — Skeleton.** Repo, Vite/React/TS, Pages project, D1 migrations, login/logout/session, first-admin
script, `/api/me`, role guard, CSP headers. *Accept:* the seeded admin logs in and sees "Hello admin"; wrong
password is rejected and the 6th attempt is locked out; no API route answers without a session; a `user`
calling an admin endpoint gets 403; the D1 `users` table contains no plaintext password.

**Phase 1 — Engine (no UI).** Formula parser/evaluator, input reader with alias mapping, employee table,
aggregation, form builder, ledger math, checks. *Accept:* unit tests pass, including: Excel rounding cases;
a tiny hand-computed fixture (3 employees, 2 units, 4 cost items) producing the expected Form 02/03; ledger
across 3 periods where payment ≠ accrual produces the expected adjustment; leading-zero employee codes survive.

**Phase 2 — Run wizard + Excel export.** *Accept:* with a JSON config loaded from a file, a user completes a
run end to end and downloads Form 02/03 and the ledger; reloading the page leaves no payroll data anywhere;
network tab shows no request carrying row data.

**Phase 3 — Admin: master tables, users, config backup.** *Accept:* CostCenter (~400 rows) round-trips through
xlsx export → edit → import with no loss; a `user` cannot reach any admin screen or endpoint.

**Phase 4 — Admin: flow editor, versions, test run.** *Accept:* a flow can be created from scratch in the UI,
tested as draft, published, and rolled back; invalid formulas block publishing with a clear message.

**Phase 5 — Seed the five flows from the workbooks.** The seeds are **starter templates**: every code, name,
rate and rule in them is sample data that the admin will edit, so nothing from the workbooks is referenced in
application code (grep the source for `0304`, `HR1000`, `WH1D`, `BH_0` — expect zero hits outside `/reference`
and the seed JSON). Order: IN (smallest) → HQ → SL → OI → QHY.
For each: translate Salary Table headers into input fields, every Form 01 column into a formula, CostName
into cost items, Form 03 column formulas, the workbook's check cells into `checks`, print sheets into layout.
Deliver each as a config JSON plus a short mapping note listing any Excel formula that was not translated
1:1 and why. *Accept:* synthetic data built from the workbook headers runs clean in the app **and** gives the
same Form 02/03 when pasted into the original workbook.

**Phase 6 — Parallel run.** The team runs one real period in both Excel and the app and compares totals per
cost code and per unit. Differences are fixed in configuration, not code, wherever possible.
*Accept:* zero difference for all five flows; owner signs off; Excel workbooks are archived.

## 11. Known translation notes for Phase 5

- **HQ:** today `Adjusted amount last period` is hard-coded 0 (`hq_calculation.m`). Seed with `adjust = true`.
  The `WH* + 0401` exclusion and "0401 not on Form 03" become `rowFilter`s. Group name line → run parameter.
- **SL:** two inputs (`SalaryTable`, `SalaryDetail`). The 0304-vs-0319 split by unit code
  (`WH1D`, `TR`, unit ending in a digit) should become a flag column on `CostCenter`, not a formula on the
  code's spelling. `tbl_additionalsalary` becomes a master table. PIT placement uses the
  `Check Allocation PIT` rule (HC-numbered cost centres go to `0317Q_SI` when present).
- **IN:** rates, base salary and regional minimum wage come from `Params` (the workbooks disagree:
  2,530,000 / 4,730,000 in IN vs 1,800,000 / 4,160,000 in OI — admin sets the right values once).
  Form 02 = SI/HI/UI, Form 03 = trade-union fund: express both through `accrue`/`pay` and row filters.
  Seed with `adjust = false` until the payment side is defined (section 2), then switch it on in config.
  The Summary sheet (headcount, base, rate, amount per fund) is a third output sheet for this flow.
- **OI:** seed with `adjust = true`. One cost item per run, chosen as a run parameter from the cost-item master (~60 entries, with EN
  names). Per-row Helper and Cost Center overrides exist in the workbook (`_cost = "0407Q_PQ"` cases);
  model them as formulas on the employee table.
- **QHY:** inputs `EmployeeList` and `SalarySetting`; master tables `Scheme`, `Group`, accrual `%` and divisor
  per bonus type. Scheme cells today mix numbers and text like `2 * Base Salary`: split into a fixed-amount
  table and a salary-multiplier table. Hùng Vương bonus rule (stops after month 4) becomes a formula using
  `run.month`. Today it only outputs "Accrual This Period"; seed with Form 02 + `adjust = true`, no Form 03.
- **All:** the `.m` files fetched from GitHub at refresh time are replaced by the engine; nothing is
  fetched at run time.

## 12. Out of scope

PDF export, e-mail to AC, ERP/accounting import, approval workflow, per-flow permissions, server-side
storage of payroll or ledger data, mobile layout, multi-language UI.

## 13. Risks

| Risk | Mitigation |
|---|---|
| No real data available for testing | Synthetic fixtures from real headers; cross-check in the original workbooks; mandatory parallel run (Phase 6). |
| Passwords handled by our own code | PBKDF2 + salted hashes, hashed session tokens, lockout, forced change of temporary passwords (3.1). |
| Ledger file lost or stale | Hash check against `ledger_marks`; team keeps the file in one shared folder with period in the name. A lost ledger cannot be rebuilt by the app. |
| Admin formula error produces wrong money | Validation on save, draft/test/publish, versioning with rollback, totals checks in every flow. |
| Payroll export format changes | Alias mapping + run-time manual mapping; no code change needed. |
| Single-person units reveal a salary in outputs | Unchanged from today's Excel; nothing is stored server-side. |
