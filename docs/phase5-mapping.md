# Phase 5 — đối chiếu Power Query (.m) → cấu hình flow

Nguồn: `izark99/m-query` (`hq_calculation.m`, `sl_form02.m`, `in_form02.m`, `oi_form03.m`, `qhy_accrual.m`).
Bản sao đọc-only nằm ở `reference/` (không commit). Các mã trong tài liệu này là dữ liệu mẫu, không có trong code.

Chưa có 5 workbook `.xlsm`, nên phần Form 01 (input, công thức từng cột, danh sách cost item) chưa dịch được.
Tài liệu này chốt phần đã xác định được từ `.m`.

## 1. Phần chung của cả 5 query

| Bước trong `.m` | Trong app |
|---|---|
| `Cost Code` ⟗ `Unit` theo `Key` (Full Outer) | Cost item → **`unitFilter`** (mới thêm), ví dụ `CC("Key") = "SB"`. Excel bỏ âm thầm số tiền không khớp Key; app vẫn loại nhưng báo **cảnh báo** kèm mã NV |
| `Budget Code = Record.FieldOrDefault(_, [Group])` | Cost item `budget` = tên cột của bảng `CostCenter` (HR / AT / Opex …), tra theo đơn vị |
| `Definition 01` (Mã bộ phận → TTCP, Dept, SB/WH) | Master `CostCenter`: cột đầu = mã đơn vị, có `Dept`, `Cost Center` (=TTCP), `SB/WH`, `Sector`, các cột Budget, `Key` |
| `Sector = if SB/WH = "DHG" then "DHG" else "KBH"` | Cột `Sector` trong master (điền sẵn), `aggregation.sectorColumn = "Sector"` |
| `Definition 02` (Helper → Tên chi phí) | Cost item `nameVi` |
| `Cost Code = Text.Start(Helper, 4)` | Cost item `costCode` |
| `Type = Text.Middle(Helper, 4, 1)`, rỗng → M | Cost item `periodType` (M/Q/H/Y) |
| `Item` = `_m/_q/_h & "." & _year` | `{period}` = `T09.2026` / `Q03.2026` / `H02.2026` / `2026` (cần đối chiếu định dạng `_m/_q/_h` trong workbook) |
| `Description = Tên chi phí & "_" & Item & "_" & Dept & "-" & Unit` | `descriptionTemplate = "{prefix} {name}_{period}_{dept}-{unit}"` — HQ/SL/IN/QHY **không có tiền tố** → để `prefix` trống |
| Sort Dept, Unit, Cost Center, Budget Code, Helper | Giống hệt engine |
| `Form01` join theo Unit + Attribute(Helper) + Budget Code, lấy `Value` | Tổng hợp theo Unit × Budget × Cost Center × Helper |

## 2. Từng flow

**HQ (`hq_calculation.m`)**
- Bỏ dòng có Accrual = 0. `Adjusted amount last period` cố định 0.
- `Actual = Accrual − Adjusted` (dấu ngược SL; không ảnh hưởng vì Adjusted = 0). Seed dùng logic SL: `Accrual + Adjusted`, `adjust = true` (D7).

**SL (`sl_form02.m`)**
- Điều chỉnh từ bảng `accumulated` join theo Unit, Budget Code, Cost Center, Cost Code, Helper — **trùng khoá ledger của app**.
- Chỉ bỏ dòng khi cả Accrual và Adjusted = 0 — giống engine.
- Lọc `Helper <> "0401"`: so sánh **nguyên chuỗi**. Nếu helper thực tế dạng `0401M_…` thì lọc này không có tác dụng → cần xem workbook. Trong app làm bằng `forms.form02.rowFilter = row.costCode <> "0401"` hoặc `accrue = false` trên cost item.

**IN (`in_form02.m`)**
- Form01 có `Value` và `NLD Value` → cost item `amount` + `employeeAmount`.
- Cột Form 02: Accrual, Deduction in employee salary, `Actual = Accrual + Deduction` → cột công thức `row.amount + row.employeeAmount`.
- Không có điều chỉnh → `adjust = false` (điểm mở PLAN §2).

**OI (`oi_form03.m`)**
- Form 03 pivot theo Attribute: `Tổng lãnh` → Gross, `Thuế TN` → PIT, `Trừ khác` → Other Deduction, `Thực lãnh` → Net. Mỗi cột là một cột Form 03 với `UNITSUM(emp.…)`.
- Bỏ dòng Gross = 0.
- Diễn giải `"Chi " & _vn & "_" & Item & "_" & Dept & "-" & Unit`. `_vn` = tên khoản do người chạy chọn → tham số chạy kiểu `master` + `prefix = "Chi"`.
- Ngoại lệ diễn giải: helper `0407M_SC` thêm ` (SCIC)`; đơn vị `HRD` thêm ` (TV HĐQT không điều hành)` → cột Diễn giải của Form 03 là công thức, phần hậu tố lấy từ bảng master (không viết cứng mã).
- Ngoại lệ Cost Center theo helper (`0407M_BD`, `0407M_SC` → BD; `0614M_LSF` → LSF; `0614M_BU3` → BU3; `0318` → BM6) → master `HelperCostCenter` (Helper, Cost Center) + cột bảng nhân viên tra bảng này và gán vào `costCenterColumn` của cost item.
- Khi seed `adjust = true` thì cần quyết định Form nào ghi vào sheet `actual` của ledger.

**QHY (`qhy_accrual.m`)**
- Chỉ có "Accrual amount this period".
- Diễn giải luôn dùng `_m` (tháng) kể cả với khoản Q/H/Y; app dùng kỳ theo `periodType` → **khác Excel**, cần xác nhận cách nào đúng.
- Không lọc dòng 0 (do Full Outer join nên có thể sinh dòng 0); app bỏ dòng 0 → **khác Excel có chủ đích**.
- Seed: Form 02 + `adjust = true`, Form 03 tắt.

## 3. Còn thiếu để làm seed (cần từ 5 workbook)

1. Tiêu đề cột của file xuất lương (Salary Table / Salary Detail / EmployeeList / SalarySetting) → `inputs[].fields[].aliases`.
2. Công thức từng cột của Form 01 → `employeeTable.columns`.
3. Sheet Cost Code (Helper, Group/Budget, Key, Tên chi phí, tên EN) và dấu hiệu khoản nào Trích / Chi → `costItems`.
4. Sheet Unit / Definition 01 → master `CostCenter`.
5. Công thức các cột khấu trừ của Form 03 (SL/HQ: cơm, BHXH/BHYT/BHTN, TNCN, công đoàn, vay, ủng hộ…) và quy tắc `Check Allocation PIT`.
6. Các ô kiểm tra trong workbook → `checks`.
7. Sheet "Form 02 - Print" / "Form 03 - Print": tiêu đề, dòng "Đơn vị", chữ ký, độ rộng cột → `layout`.
8. Tham số (tỷ lệ BH, lương cơ sở, lương tối thiểu vùng, % trích, số chia) → `Params`.
9. IN: sheet Summary. QHY: bảng Scheme, Group, % và số chia theo loại thưởng.
