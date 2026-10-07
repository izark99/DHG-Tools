// Reference of every formula function, shown on the admin guide page. A unit test checks that each
// function of the engine has an entry here (and nothing else), so the guide never falls behind.

export type FnGroup = 'logic' | 'math' | 'text' | 'date' | 'lookup' | 'data';

export interface FnDoc {
  sig: string;
  desc: string;
  group: FnGroup;
}

export const FN_GROUP_LABEL: Record<FnGroup, string> = {
  logic: 'Điều kiện, logic',
  math: 'Số, làm tròn',
  text: 'Chữ',
  date: 'Ngày tháng',
  lookup: 'Tra bảng master, cost item',
  data: 'Gom dữ liệu nhân viên / đơn vị',
};

export const FN_DOCS: Record<string, FnDoc> = {
  IF: { group: 'logic', sig: 'IF(điều kiện, khi đúng, [khi sai])', desc: 'Như Excel. Thiếu "khi sai" thì trả FALSE.' },
  IFS: { group: 'logic', sig: 'IFS(đk1, giá trị1, đk2, giá trị2, …)', desc: 'Giá trị của điều kiện đúng đầu tiên. Không điều kiện nào đúng là lỗi — thêm TRUE, giá trị mặc định ở cuối.' },
  IFERROR: { group: 'logic', sig: 'IFERROR(biểu thức, khi lỗi)', desc: 'Trả "khi lỗi" nếu biểu thức lỗi (không tìm thấy, chia cho 0…).' },
  ISERROR: { group: 'logic', sig: 'ISERROR(biểu thức)', desc: 'TRUE nếu biểu thức lỗi.' },
  AND: { group: 'logic', sig: 'AND(a, b, …)', desc: 'TRUE khi mọi điều kiện đúng.' },
  OR: { group: 'logic', sig: 'OR(a, b, …)', desc: 'TRUE khi có ít nhất một điều kiện đúng.' },
  NOT: { group: 'logic', sig: 'NOT(a)', desc: 'Đảo đúng / sai.' },
  IN: { group: 'logic', sig: 'IN(giá trị, a, b, …)  hoặc  giá trị IN ("a", "b")', desc: 'TRUE nếu giá trị bằng một trong các giá trị liệt kê (không phân biệt hoa / thường).' },
  SWITCH: { group: 'logic', sig: 'SWITCH(giá trị, k1, kết quả1, k2, kết quả2, …, [mặc định])', desc: 'Như Excel.' },
  ISNUMBER: { group: 'logic', sig: 'ISNUMBER(x)', desc: 'TRUE nếu x là số (biểu thức lỗi cũng trả FALSE, không báo lỗi).' },
  ISTEXT: { group: 'logic', sig: 'ISTEXT(x)', desc: 'TRUE nếu x là chữ.' },
  ISBLANK: { group: 'logic', sig: 'ISBLANK(x)', desc: 'TRUE nếu x trống.' },
  LET: { group: 'logic', sig: 'LET(tên, giá trị, …, biểu thức)', desc: 'Đặt tên cho kết quả trung gian để dùng lại, như Excel. Ví dụ LET(x, [a]*2, x + 1).' },

  ROUND: { group: 'math', sig: 'ROUND(x, [số chữ số])', desc: 'Làm tròn như Excel (0,5 làm tròn ra xa số 0). Số chữ số âm: -3 = tròn nghìn.' },
  ROUNDUP: { group: 'math', sig: 'ROUNDUP(x, [số chữ số])', desc: 'Làm tròn lên (ra xa số 0).' },
  ROUNDDOWN: { group: 'math', sig: 'ROUNDDOWN(x, [số chữ số])', desc: 'Làm tròn xuống (về phía số 0).' },
  MIN: { group: 'math', sig: 'MIN(a, b, …)', desc: 'Giá trị nhỏ nhất.' },
  MAX: { group: 'math', sig: 'MAX(a, b, …)', desc: 'Giá trị lớn nhất.' },
  ABS: { group: 'math', sig: 'ABS(x)', desc: 'Giá trị tuyệt đối.' },
  SUM: { group: 'math', sig: 'SUM(a, b, …)', desc: 'Tổng. Ở phạm vi total dùng được với cả cột: SUM(emp.x), SUM(f02.x), SUM(in.Input.field).' },
  COUNT: { group: 'math', sig: 'COUNT(a, b, …)', desc: 'Đếm số giá trị là số.' },
  VALUE: { group: 'math', sig: 'VALUE(chữ)', desc: 'Đổi chữ thành số; đọc được cả hỗn số như "0 1/6".' },

  LEFT: { group: 'text', sig: 'LEFT(chữ, [n])', desc: 'n ký tự đầu (mặc định 1).' },
  RIGHT: { group: 'text', sig: 'RIGHT(chữ, [n])', desc: 'n ký tự cuối (mặc định 1).' },
  MID: { group: 'text', sig: 'MID(chữ, vị trí, n)', desc: 'n ký tự từ vị trí (bắt đầu từ 1).' },
  LEN: { group: 'text', sig: 'LEN(chữ)', desc: 'Độ dài.' },
  TRIM: { group: 'text', sig: 'TRIM(chữ)', desc: 'Bỏ khoảng trắng thừa.' },
  UPPER: { group: 'text', sig: 'UPPER(chữ)', desc: 'Chữ hoa.' },
  LOWER: { group: 'text', sig: 'LOWER(chữ)', desc: 'Chữ thường.' },
  PROPER: { group: 'text', sig: 'PROPER(chữ)', desc: 'Viết hoa chữ cái đầu mỗi từ.' },
  TEXT: { group: 'text', sig: 'TEXT(số, "định dạng")', desc: 'Định dạng số thành chữ, ví dụ TEXT(run.month, "00") → "09".' },
  CONTAINS: { group: 'text', sig: 'CONTAINS(chữ, cần tìm)', desc: 'TRUE nếu chữ có chứa "cần tìm" (không phân biệt hoa / thường).' },
  SUBSTITUTE: { group: 'text', sig: 'SUBSTITUTE(chữ, cũ, mới, [lần thứ])', desc: 'Thay chữ, như Excel. Ví dụ đổi "Trích" thành "Chi" trong diễn giải Form 03.' },
  TEXTBEFORE: { group: 'text', sig: 'TEXTBEFORE(chữ, dấu, [lần thứ])', desc: 'Phần đứng trước dấu.' },
  TEXTAFTER: { group: 'text', sig: 'TEXTAFTER(chữ, dấu, [lần thứ])', desc: 'Phần đứng sau dấu.' },
  TEXTJOIN: { group: 'text', sig: 'TEXTJOIN(dấu nối, bỏ ô trống?, a, b, …)', desc: 'Nối chữ, như Excel. Ví dụ TEXTJOIN(" ", TRUE, họ, tên).' },
  CONCAT: { group: 'text', sig: 'CONCAT(a, b, …)', desc: 'Nối chữ (giống dùng dấu &).' },

  DATE: { group: 'date', sig: 'DATE(năm, tháng, ngày)', desc: 'Ngày dạng số như Excel. DATE(năm, tháng, 0) = ngày cuối tháng trước.' },
  EOMONTH: { group: 'date', sig: 'EOMONTH(ngày, số tháng)', desc: 'Ngày cuối tháng, sau / trước số tháng.' },
  TODAY: { group: 'date', sig: 'TODAY()', desc: 'Ngày hôm nay (ngày chạy).' },
  YEAR: { group: 'date', sig: 'YEAR(ngày)', desc: 'Năm của một ngày.' },
  MONTH: { group: 'date', sig: 'MONTH(ngày)', desc: 'Tháng của một ngày.' },
  DAY: { group: 'date', sig: 'DAY(ngày)', desc: 'Ngày trong tháng.' },

  LOOKUP: {
    group: 'lookup',
    sig: 'LOOKUP("Bảng", khoá, "Cột", [mặc định])',
    desc: 'Tra bảng master theo cột đầu (không phân biệt hoa / thường). Không tìm thấy mà không có mặc định là lỗi. Ô trống trả mặc định.',
  },
  LOOKUP2: { group: 'lookup', sig: 'LOOKUP2("Bảng", khoá, "Cột", [mặc định])', desc: 'Giống LOOKUP (giữ cho các công thức dịch từ workbook).' },
  EXISTS: { group: 'lookup', sig: 'EXISTS("Bảng", khoá)', desc: 'TRUE nếu khoá có trong bảng.' },
  CC: { group: 'lookup', sig: 'CC("Cột")', desc: 'Giá trị cột của bảng đơn vị (CostCenter) cho đơn vị của dòng đang tính, ví dụ CC("SB/WH").' },
  ITEM: { group: 'lookup', sig: 'ITEM(helper, "trường")', desc: 'Thông tin một cost item của flow: nameVi, nameEn, budget, costCode, periodType… Ví dụ ITEM(run.cost, "nameVi").' },

  FIRST: { group: 'data', sig: 'FIRST(in.Input.field)', desc: 'Bảng nhân viên: giá trị dòng đầu tiên của chính nhân viên đó trong một input.' },
  SUMOF: { group: 'data', sig: 'SUMOF(in.Input.field)', desc: 'Bảng nhân viên: tổng các dòng của chính nhân viên đó trong một input.' },
  SUMIFS: {
    group: 'data',
    sig: 'SUMIFS(cột tổng, cột điều kiện1, điều kiện1, …)',
    desc: 'Như Excel; điều kiện hỗ trợ "*", "?", "<>x", ">=10". Ở bảng nhân viên chỉ tính các dòng của chính nhân viên đó.',
  },
  COUNTIFS: { group: 'data', sig: 'COUNTIFS(cột1, điều kiện1, …)', desc: 'Như Excel; cách viết điều kiện giống SUMIFS.' },
  UNITSUM: { group: 'data', sig: 'UNITSUM(emp.cột)', desc: 'Form: tổng một cột nhân viên của cả đơn vị. Thường đặt vào một dòng (ví dụ dòng 0304) để không bị tính trùng.' },
  ROWSUM: { group: 'data', sig: 'ROWSUM(emp.cột)', desc: 'Form: tổng một cột nhân viên của các nhân viên góp vào đúng dòng này.' },
  UNITCOUNT: { group: 'data', sig: 'UNITCOUNT(điều kiện)', desc: 'Form: số dòng cùng đơn vị thoả điều kiện, ví dụ UNITCOUNT([pit] <> 0).' },
  COUNTSAME: { group: 'data', sig: 'COUNTSAME([cột])', desc: 'Số dòng có cùng giá trị ở cột này, ví dụ kiểm tra trùng mã: COUNTSAME([emp_id]) = 1.' },
  GROUPCOUNT: { group: 'data', sig: 'GROUPCOUNT(khoá, điều kiện)', desc: 'Số dòng có cùng khoá và thoả điều kiện, trong bảng đang tính.' },
};
