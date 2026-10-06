# DHG-Tools — C&B Forms

Web app thay cho 5 workbook Excel/Power Query/VBA (HQ, SL, IN, OI, QHY): biến file xuất từ hệ thống lương thành
**Form 02 (Trích)** và **Form 03 (Chi)** gửi Kế toán. Thiết kế chi tiết: [`docs/PLAN.md`](docs/PLAN.md).

- Toàn bộ dữ liệu lương được xử lý **trong trình duyệt**. Server (Cloudflare Pages Functions + D1) chỉ lưu
  tài khoản, cấu hình flow, bảng master, dấu hash của ledger và nhật ký chạy — không có dòng lương hay số tiền nào.
- Mọi hành vi đến từ cấu hình do admin khai báo (công thức kiểu Excel). Code không chứa mã chi phí, mã đơn vị,
  tỷ lệ hay danh sách ngoại lệ nào.

## Cấu trúc

| Thư mục | Nội dung |
|---|---|
| `src/engine/` | Engine thuần TypeScript (không DOM, không network): parser/evaluator công thức, đọc input theo alias, bảng nhân viên, tổng hợp, Form 02/03, ledger + điều chỉnh, kiểm tra, validate config |
| `src/excel/` | Đọc/ghi `.xlsx` bằng ExcelJS: input, ledger, Form 02/03 theo layout in, master table |
| `src/ui/` | React SPA: đăng nhập, chạy flow (wizard), admin (master data, flow editor, phiên bản, người dùng, backup) |
| `functions/` | API `/api/*` trên Cloudflare Pages Functions, D1 binding `DB` |
| `migrations/` | Schema D1 |
| `scripts/create-admin.mjs` | Tạo admin đầu tiên |
| `tests/` | Smoke test API (Phase 0) và test E2E trên Chromium |
| `reference/` | Đặt workbook `.xlsm` và file `.m` tham chiếu (không commit, không deploy) |

## Chạy local

```bash
npm install
npm run build
npx wrangler d1 migrations apply cb-forms --local
ADMIN_PASSWORD='mat-khau-toi-thieu-10' node scripts/create-admin.mjs admin "Quản trị" > admin.local.sql
npx wrangler d1 execute cb-forms --local --file admin.local.sql && rm admin.local.sql
npm run pages:dev          # http://127.0.0.1:8788
```

Cookie phiên có cờ `Secure`; Chromium chấp nhận cookie này trên `127.0.0.1`/`localhost`.

## Deploy lên Cloudflare (free tier)

```bash
npx wrangler login
npx wrangler d1 create cb-forms              # chép database_id vào wrangler.toml
npx wrangler d1 migrations apply cb-forms --remote   # chạy lại mỗi khi có migration mới (vd. 0002_ui_texts)
npx wrangler pages project create cb-forms
npm run build && npx wrangler pages deploy dist
```

Tạo admin đầu tiên (không có endpoint công khai nào làm việc này):

```bash
node scripts/create-admin.mjs admin "Quản trị" > admin.local.sql   # hỏi mật khẩu, hoặc đặt ADMIN_PASSWORD
npx wrangler d1 execute cb-forms --remote --file admin.local.sql
rm admin.local.sql
```

Admin tạo các tài khoản còn lại trong màn hình **Người dùng** (mật khẩu tạm, bắt buộc đổi ở lần đăng nhập đầu).

## Kiểm thử

```bash
npm test                                    # unit test engine + Excel
npm run typecheck
# với `npm run pages:dev` đang chạy:
ADMIN_PASSWORD=... npm run test:api        # acceptance Phase 0 (session, 403, lockout, CSRF, CSP)
ADMIN_PASSWORD=... npm run test:e2e        # Chromium: tạo/publish/rollback flow, chạy, tải file, privacy, CSP
```

## Quy trình dùng

1. **Admin** nạp bảng master (grid hoặc import xlsx): bảng đơn vị (ví dụ `CostCenter`: cột đầu là mã đơn vị,
   có cột Dept / Cost Center / Sector và các cột Budget), `Params` (`key`, `value`) cho tỷ lệ, lương cơ sở…
2. **Admin** tạo flow trong **Flows** → sửa các tab (Inputs, Tham số chạy, Bảng nhân viên, Cost items, Tổng hợp,
   Form 02/03, Kiểm tra, Sheet thêm) → **Lưu nháp** → **Chạy thử** → **Publish**. Config còn lỗi công thức
   không publish được. Rollback = publish lại phiên bản cũ (tab Phiên bản).
3. **User** chọn flow → nhập kỳ, tham số → tải file lương (+ file ledger mới nhất) → **Tính** → xem lỗi/kiểm tra,
   preview → **Tải Form + Ledger** (một thao tác tải cả hai file). Lưu file ledger mới vào thư mục chung;
   lần chạy sau app so hash và cảnh báo nếu dùng file cũ.
4. **Admin** sửa tiêu đề, mô tả, hướng dẫn ngay trên giao diện: bấm nút bút chì ở góc dưới sidebar (hoặc
   **Quản trị › Giao diện**). Chữ có viền nét đứt là sửa được: bấm vào, sửa, **Lưu** (áp dụng cho mọi người
   ngay). Mỗi trang có khung **Hướng dẫn** (chỉ hiện khi có nội dung); trang chạy flow có hướng dẫn chung và
   hướng dẫn riêng từng flow. Trang **Giao diện** liệt kê văn bản đã sửa, khôi phục mặc định, và cho sửa chữ
   của trang đăng nhập qua bản xem trước. Văn bản giao diện nằm trong file backup.

## Ngôn ngữ công thức (tóm tắt)

`[cột]` cột phía trước cùng dòng · `in.<Input>.<field>` · `FIRST(in.X.f)` / `SUMOF(in.X.f)` theo mã NV ·
`P.<key>` (bảng Params) · `run.month`, `run.year`, `run.<tham số>` · `row.<field>` (Form) ·
`UNITSUM(emp.<cột>)` tổng cột nhân viên của đơn vị · `UNITCOUNT(điều kiện)` · `COUNTSAME([cột])` ·
`LOOKUP("Bảng", khoá, "Cột", mặc định)`, `LOOKUP2`, `EXISTS`, `CC("cột")` ·
`IF, IFS, IFERROR, AND, OR, NOT, IN, SWITCH, ROUND, ROUNDUP, ROUNDDOWN, MIN, MAX, ABS, SUM, COUNT, LEFT, RIGHT,
MID, LEN, TRIM, UPPER, LOWER, VALUE, TEXT, ISNUMBER, ISBLANK, CONTAINS`. `x IN ("a","b")` dùng được dạng infix.
ROUND làm tròn như Excel (half away from zero). Chia cho 0 là lỗi (chặn xuất file), không ra NaN.

## Trạng thái theo phase

| Phase | Trạng thái |
|---|---|
| 0 Skeleton, auth | Xong — `tests/api-smoke.sh` 30/30 |
| 1 Engine | Xong — unit test (rounding Excel, fixture 3 NV/2 đơn vị/4 cost item, ledger 3 kỳ, mã NV có số 0 đầu) |
| 2 Run wizard + Excel | Xong — E2E: chạy trọn vòng, tải Form + ledger, reload không còn dữ liệu, không request nào mang dữ liệu lương |
| 3 Admin: master, users, backup | Xong — round-trip xlsx 400 dòng; user không vào được màn hình/API admin |
| 4 Flow editor, versions, test run | Xong — E2E: tạo từ file, công thức sai chặn publish, publish, rollback |
| 5 Seed 5 flow từ workbook | Xong — `seed/` (HQ, SL, IN, OI, QHY); test chạy cả 5 flow trên dữ liệu giả. Cách nạp và các điểm khác Excel: `docs/phase5-mapping.md` |
| 6 Chạy song song | Việc của team C&B sau Phase 5 |

Điểm mở (PLAN §2): phía chi trả của IN (cột/Form nào ghi vào sheet `actual` của ledger) — owner cần quyết định;
đến khi đó seed IN để `adjust = false`.
