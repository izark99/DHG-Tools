# Phase 5 — Đối chiếu workbook / Power Query → cấu hình flow

Nguồn: 5 workbook (`001 HQ`, `002 SL`, `003 IN`, `004 OI`, `005 QHY`) và các query `.m` trong `izark99/m-query`.
Bản sao chỉ đọc nằm ở `reference/` và không được commit (repo public). Code trong `seed/` không chứa dữ liệu công ty:
không có master, tên người ký hay mã nhân viên. Những thứ đó chỉ có trong bundle cục bộ.

## 1. Quy trình tạo seed

```bash
npm run seed:masters    # reference/wb/*.xlsm → reference/out/masters.json (master + tên người ký mặc định)
npm run seed            # seed/out/<FLOW>.config.json (không có dữ liệu) + reference/out/cb-forms-seed.backup.json
npm run seed:synthetic  # reference/out/synthetic/<FLOW>_synthetic.xlsx: dữ liệu lương giả để chạy song song
```

Import `cb-forms-seed.backup.json` qua **Admin › Sao lưu**. Thao tác này nạp 9 bảng master và 5 flow; flow cần publish trước khi dùng.

`seed/seed.test.ts` kiểm tra từng flow, chạy trên bộ master giả trong `seed/fixture.ts` (dùng cho CI) và trên `masters.json` cục bộ nếu có:
- cấu hình hợp lệ;
- đọc input qua alias;
- chạy không phát sinh lỗi;
- xuất được file Excel.

## 2. Master tách ra từ workbook

| Master | Nguồn |
|---|---|
| `CostCenter` | Sheet Unit / Definition 01. Lấy SL làm gốc, gộp thêm `Sector`, `OI Nhóm`, `Monthly KPI`, `Position` (QHY) và cờ `Lương 0304` (SL) |
| `UnitGroup` | HQ `D_Position` (Unit Code → Direct / In-direct Production) |
| `SalesPosition` | SL (Tên chức danh → Tính thưởng) |
| `AdditionalSalary` | SL `tbl_additionalsalary` |
| `QHY_Group`, `QHY_Scheme`, `QHY_Bonus` | QHY (Nhóm theo mã chức danh, mức thưởng theo nhóm, % trích và số chia) |
| `TimeLabels` | OI (nhãn tháng / quý / nửa năm VN–EN cho tiêu đề) |
| `Params` | Tỷ lệ BH công ty và NLĐ, KPCĐ, LCS, TTV, HUNGKING |

Các workbook không thống nhất với nhau ở mấy điểm sau; `extract_masters.py` ghi lại trong `notes`:
- `DC3`: cột HR/AT của SL khác các workbook còn lại.
- `QCD9`: cột Opex khác nhau.
- LCS và TTV của IN khác OI. Seed lấy giá trị của IN.

Team C&B cần chốt các giá trị này trước khi chạy song song.

## 3. Phần chung

| Excel / `.m` | Trong app |
|---|---|
| `Key` của Cost Code | Mọi dòng đều là `"nht"`, nên không có join theo Key. Lọc đơn vị chuyển thành `aggregation.unitFilter` (HQ: `SB/WH <> "SB"`; SL: `= "SB"`; mọi flow bỏ mã có `Z`) |
| Budget Code | Có 2 cách. Tên cột `CostCenter` (HR / AT / Opex) thì tra theo đơn vị. Mã dài hơn 4 ký tự (`HR1000`, `HR0201`) là mã cố định, dùng nguyên |
| `Item` | Tháng/quý/nửa năm theo `periodType`. Kỳ **Y** trong HQ/SL/IN cho ra `Item = ""`; app dùng năm, ví dụ `2026` |
| Description Form 02 | `{name}_{period}_{dept}-{unit}`. Tên chi phí đã có chữ "Trích" ở đầu |
| Description Form 03 | `SUBSTITUTE(row.description, "Trích", "Chi")` |
| Khoản trừ Form 03 theo đơn vị | `unitDeduction(cột, [mã chi phí nhận khoản trừ])`: tổng của đơn vị đặt vào dòng 0304/0301. Riêng "Đơn vị giữ lại" đặt vào dòng 0307 |
| Ô kiểm tra (Check) | `checks` mức `error`. Nội dung báo lỗi ghi kèm ô gốc, ví dụ `(Form 03!AB1)` |
| Form Print | `layout`: tiêu đề VN/EN, dòng "Đơn vị:", hướng giấy, dòng tổng trên/dưới, ô ký, khối "Phòng Kế toán kiểm tra" |

## 4. Từng flow

**HQ**
- Input: 42 cột của Salary Table.
- `group` lấy từ `UnitGroup`. Lương phân bổ (1) chia sang Lương phân bổ hoặc Lương sản phẩm theo group.
- Form 02 bỏ tiền ăn (0401) của các Dept `WH*`.
- Cột khấu trừ có tổng bằng 0 sẽ bị ẩn khi in (D14).
- Tham số chạy `group` dùng cho dòng "Đơn vị:" và tên file.
- Khác Excel: Form 01 của workbook tra một vài cột theo tên hoặc GC thay vì Mã NV. App tra mọi cột theo Mã NV.

**SL**
- Input: Salary Table và Salary Detail. Các cột thưởng (khoán, khoán quý, thu tiền) tính bằng `SUMIFS` trên Salary Detail.
- `bonus_group` lấy từ `SalesPosition`.
- Khoản tháng có cả trích và chi. Khoản Q/Y chỉ có chi (`accrue = false`). 0401 không có trích lẫn chi.
- Cột ẩn `pit_x` thay cho cột "Check Allocation PIT".
- **Lỗi Excel:** `tbl_additionalsalary` dùng SUMIFS trên chữ `"x"`, nên kết quả luôn bằng 0. App tính theo đúng ý định và thêm một cảnh báo khi có nhân viên trong `AdditionalSalary`.
- **Cần xác nhận:** 0407M_RE cộng cả Phụ cấp, trong khi khoản này đã nằm trong Lương phân bổ. Có thể bị tính hai lần.

**IN**
- Chỉ lấy nhân viên có loại lương (1) và (2).
- Mức đóng BH bị giới hạn ở 20 × LCS (BHTN dùng TTV).
- 0312 / 0313 / 0315 chỉ trích (Form 02). 0314 KPCĐ chỉ chi (Form 03). Mỗi khoản có phần NLĐ (`employeeAmount`).
- Có sheet Summary riêng.
- `adjust = false`, không ghi ledger chi. **Điểm mở PLAN §2.**

**OI**
- 62 khoản chi trong danh mục. Khoản cụ thể được chọn lúc chạy (tham số `cost`, kiểu `costItem`).
- Cost item chung `RUN` dùng `helperColumn` để lấy budget, tên và kỳ của khoản đã chọn.
- Ngoại lệ:
  - `0407M_BD` với mã NV có đuôi `SC` chuyển thành `0407M_SC`.
  - `0407Q_PQ` của đơn vị SB/WH chuyển thành `2002Q`.
  - Cost Center ghi đè được tra trong `cc_override`.
- Diễn giải: SCIC thêm "(SCIC)"; HRD thêm "(TV HĐQT không điều hành)".
- Khác Excel:
  - Salary Table của workbook có quy tắc ghi đè `0614_LSF`, nhưng quy tắc này không bao giờ khớp. App làm theo `.m`.
  - Excel trả budget `WF` thành rỗng; app giữ chữ `WF`.

**QHY**
- Input: Employee List và Salary Setting.
- Mức thưởng = `% trích × Scheme / Số chia`. Ô Scheme có thể là số tiền, hoặc dạng `x * Base Salary` (x có thể là hỗn số, ví dụ `0 1/6`).
- Thưởng Hùng Vương chỉ tính đến tháng 4.
- Chỉ có Form 02 (trích). Form 03 tắt.
- Diễn giải luôn dùng tháng (`T{MM}`), giống `.m`.
- Khác Excel có chủ đích: app bỏ các dòng bằng 0.

## 5. Kiểm chứng

Hiện chưa đối chiếu được số liệu thật vì 2 lý do:
- Các workbook nhận được đã xoá dữ liệu input.
- LibreOffice không có `XLOOKUP`, nên không tính lại được workbook ở đây.

Khi chạy song song (Phase 6), dán file `*_synthetic.xlsx` (hoặc dữ liệu thật một kỳ) vào workbook gốc, chạy app với cùng file, rồi so từng dòng Form 02 / 03.
