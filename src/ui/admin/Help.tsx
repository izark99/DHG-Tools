// Admin user guide: how to set up and run the app, step by step. Static content; the formula
// reference is generated from the engine's function list (src/engine/formula/docs.ts).
import { useEffect, useState, type ReactNode } from 'react';
import { FN_DOCS, FN_GROUP_LABEL, type FnGroup } from '../../engine/formula/docs';
import { Icon, PageHeader } from '../layout';
import { T } from '../texts';

interface Section {
  id: string;
  title: string;
  body: ReactNode;
}

const Tip = ({ children }: { children: ReactNode }) => (
  <div className="help-tip">
    <Icon name="info" />
    <div>{children}</div>
  </div>
);

const Path = ({ children }: { children: ReactNode }) => <b className="help-path">{children}</b>;

function FormulaReference() {
  const groups = Object.keys(FN_GROUP_LABEL) as FnGroup[];
  return (
    <>
      {groups.map((g) => (
        <div key={g}>
          <h3>{FN_GROUP_LABEL[g]}</h3>
          <div className="table-wrap">
            <table className="grid help-fns">
              <tbody>
                {Object.entries(FN_DOCS)
                  .filter(([, d]) => d.group === g)
                  .map(([name, d]) => (
                    <tr key={name}>
                      <td>
                        <code>{d.sig}</code>
                      </td>
                      <td>{d.desc}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </>
  );
}

const SECTIONS: Section[] = [
  {
    id: 'overview',
    title: '1. Tổng quan',
    body: (
      <>
        <p>
          Ứng dụng tổng hợp trích và chi lương theo từng <b>flow</b> (HQ, SL, IN, OI, QHY…) và xuất Form 02 (trích), Form 03 (chi) cùng sổ ledger điều chỉnh,
          thay cho các workbook Excel.
        </p>
        <ul>
          <li>
            <b>Admin</b> quản lý master data, cấu hình flow, người dùng, văn bản giao diện và backup.
          </li>
          <li>
            <b>Người dùng</b> chỉ chạy flow đã publish: chọn kỳ, chọn đợt, tải file lương và tải về file Form.
          </li>
          <li>
            <b>Dữ liệu lương không lưu trên server.</b> File lương được đọc và tính ngay trên trình duyệt; server chỉ lưu cấu hình, master data, nhật ký chạy (ai,
            flow nào, kỳ nào) và dấu của file ledger mới nhất.
          </li>
        </ul>
        <h3>Quy trình hằng tháng</h3>
        <ol>
          <li>Cập nhật master data nếu có thay đổi (tỷ lệ BH, lương cơ sở, đơn vị mới…) — lưu thành phiên bản mới từ kỳ áp dụng.</li>
          <li>Cuối kỳ: người dùng chạy flow với đợt <b>Trích</b> → lấy Form 02 và file ledger mới.</li>
          <li>Khi chi thực tế (vài ngày sau): chạy lại flow cùng kỳ với đợt <b>Chi</b> → lấy Form 03; ledger giữ nguyên phần trích đã ghi.</li>
          <li>Những khoản trích và chi cùng lúc: chạy một lần với đợt <b>Trích + Chi</b>.</li>
          <li>Lưu file ledger mới vào thư mục chung; lần chạy sau phải dùng đúng file mới nhất.</li>
        </ol>
      </>
    ),
  },
  {
    id: 'first',
    title: '2. Thiết lập lần đầu',
    body: (
      <ol>
        <li>Đăng nhập bằng tài khoản admin và đổi mật khẩu tạm (tối thiểu 10 ký tự).</li>
        <li>
          <Path>Quản trị › Backup cấu hình › Nhập backup</Path>: chọn file <code>cb-forms-seed.backup.json</code> (master data và 5 flow dịch từ workbook).
        </li>
        <li>
          <Path>Quản trị › Flows</Path>: mở từng flow, kiểm tra, rồi <b>Publish</b> với kỳ bắt đầu hiệu lực (muốn áp dụng cho mọi kỳ thì chọn tháng 1 năm 2000).
        </li>
        <li>
          <Path>Quản trị › Người dùng</Path>: tạo tài khoản cho từng người trong team.
        </li>
        <li>Chạy thử mỗi flow một kỳ và đối chiếu với workbook Excel trước khi dùng chính thức.</li>
      </ol>
    ),
  },
  {
    id: 'effective',
    title: '3. Hiệu lực theo kỳ (phiên bản)',
    body: (
      <>
        <p>
          Flow và bảng master đều có <b>phiên bản</b>. Mỗi lần publish flow hoặc lưu bảng master, ứng dụng tạo phiên bản mới có hiệu lực từ một kỳ lương (tháng/năm)
          do admin chọn. Phiên bản trước tự kết thúc ở kỳ liền trước; không phiên bản nào bị sửa hay xoá.
        </p>
        <p>
          Khi chạy, ứng dụng lấy phiên bản flow và từng bảng master <b>có hiệu lực cho kỳ được chọn</b>. Vì vậy chạy lại kỳ cũ cho ra đúng kết quả cũ.
        </p>
        <Tip>
          Ví dụ: Params v2 (LCS = 2.340.000) lưu với hiệu lực từ 07/2026. Kỳ 06/2026 vẫn dùng v1 (LCS cũ), từ kỳ 07/2026 trở đi dùng v2.
        </Tip>
        <h3>Trạng thái phiên bản</h3>
        <table className="grid help-table">
          <tbody>
            <tr>
              <td>Hiện hành</td>
              <td>Đang áp dụng cho kỳ hiện tại.</td>
            </tr>
            <tr>
              <td>Sắp áp dụng</td>
              <td>Bắt đầu từ một kỳ sau kỳ hiện tại.</td>
            </tr>
            <tr>
              <td>Đã hết hiệu lực</td>
              <td>Chỉ áp dụng cho các kỳ trước; vẫn dùng khi chạy lại kỳ cũ.</td>
            </tr>
            <tr>
              <td>Bị thay thế</td>
              <td>Có phiên bản mới hơn bắt đầu cùng kỳ, nên không áp dụng cho kỳ nào.</td>
            </tr>
            <tr>
              <td>Đã huỷ hiệu lực</td>
              <td>Admin đã huỷ; vẫn lưu trong lịch sử và có thể khôi phục.</td>
            </tr>
          </tbody>
        </table>
        <ul>
          <li>Hộp thoại lưu / publish cho xem trước khoảng hiệu lực của mọi phiên bản sau khi lưu.</li>
          <li>Chọn kỳ lùi về quá khứ thì chạy lại các kỳ đó sẽ dùng phiên bản mới — ứng dụng có cảnh báo.</li>
          <li>Lỡ lưu sai: dùng <b>Huỷ hiệu lực</b> trên phiên bản đó (không xoá), các kỳ của nó quay về phiên bản liền trước.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'masters',
    title: '4. Master data',
    body: (
      <>
        <p>
          <Path>Quản trị › Master data</Path>: các bảng tra cứu dùng chung cho mọi flow. <b>Cột đầu tiên là khoá</b> (không trùng). Tham số dạng số (tỷ lệ BH,
          LCS, TTV…) nằm trong bảng <code>Params</code> với hai cột <code>key</code>, <code>value</code>, công thức gọi bằng <code>P.key</code>.
        </p>
        <ol>
          <li>
            Ô <b>Kỳ</b> ở góc trên phải: xem bảng như ở một kỳ bất kỳ. Danh sách bên trái hiện số phiên bản đang áp dụng và số dòng.
          </li>
          <li>Sửa trực tiếp trên lưới: sửa ô, <b>+ Dòng</b>, <b>+ Cột</b>, đổi tên cột ở dòng tiêu đề, ✕ để xoá dòng / cột.</li>
          <li>
            <b>Nhập xlsx</b>: chế độ <i>gộp theo khoá</i> (cập nhật dòng trùng khoá, thêm dòng mới, giữ dòng cũ) hoặc <i>thay thế toàn bộ</i>. <b>Xuất xlsx</b> để
            sửa bằng Excel rồi nhập lại.
          </li>
          <li>
            <b>Lưu phiên bản mới</b>: chọn kỳ bắt đầu hiệu lực và ghi chú thay đổi.
          </li>
          <li>
            Khung <b>Lịch sử phiên bản</b>: <i>Nạp vào trình sửa</i> để lấy dữ liệu một phiên bản cũ làm điểm bắt đầu; <i>Huỷ hiệu lực</i> / <i>Khôi phục</i>.
          </li>
        </ol>
        <Tip>
          Mã đơn vị, mã nhân viên được giữ dạng chữ (giữ số 0 đầu). Một ô chỉ thành số khi cả cột đang là số và không có số 0 ở đầu. <b>Xoá bảng</b> xoá cả lịch sử
          phiên bản — chỉ dùng cho bảng tạo nhầm.
        </Tip>
      </>
    ),
  },
  {
    id: 'flows',
    title: '5. Cấu hình flow',
    body: (
      <>
        <p>
          <Path>Quản trị › Flows</Path>: danh sách flow, phiên bản đang dùng, bản nháp, và ô <i>hiện cho người dùng</i> (bỏ chọn để ẩn flow khỏi trang chạy).
          Tạo flow mới từ cấu hình trống, <b>sao chép từ một flow có sẵn</b> (hợp khi flow mới gần giống flow cũ), hoặc từ file JSON.
        </p>
        <h3>Bắt đầu nhanh từ file lương mẫu</h3>
        <p>
          Flow mới (chưa có cost item) mở ra với nút <b>Chọn file lương mẫu</b> ở Tổng quan; flow đã có cấu hình thì dùng <i>Tạo lại từ file lương mẫu</i> hoặc nút ở bước
          File đầu vào. Trợ lý:
        </p>
        <ol>
          <li>Đọc file, tự tìm sheet và dòng tiêu đề (đổi được nếu đoán sai).</li>
          <li>
            Liệt kê mọi cột kèm ví dụ và tổng cột; đoán sẵn cột nào là <b>Mã nhân viên</b>, <b>Họ tên</b>, <b>Đơn vị</b>. Admin chọn cột nào là <b>Khoản tiền</b> (thành
            cost item), cột nào chỉ <b>Đọc vào</b> để dùng trong công thức, cột nào bỏ qua.
          </li>
          <li>Với mỗi khoản tiền: Helper, Cost code (để trống được), tên khoản, Budget, vào Form 02 / Form 03.</li>
          <li>
            Bấm <b>Tạo cấu hình</b>: File đầu vào, Bảng nhân viên, Cost items, Gộp theo đơn vị được tạo; chính file đó thành dữ liệu mẫu. Ô <b>Nên làm tiếp</b> ở Tổng quan
            chỉ bước còn thiếu hoặc còn lỗi, bấm để mở đúng dòng cần sửa.
          </li>
        </ol>
        <h3>Trình sửa: đi theo từng bước</h3>
        <p>
          Menu bên trái của trình sửa chia thành <b>Thiết lập</b> (các bước đánh số 1 → 10, số chuyển xanh khi bước đã xong và không lỗi) và <b>Công cụ</b>. Mục{' '}
          <b>Tổng quan</b> mở đầu tiên: sơ đồ flow (File đầu vào → Bảng nhân viên → Cost items → Gộp theo đơn vị → Form 02 / 03 → Ledger), danh sách bước còn
          thiếu, và <b>ma trận cost item</b> (khoản nào vào Form 02, khoản nào vào Form 03 — đánh dấu trực tiếp). Bấm vào một ô của sơ đồ để tới bước đó.
        </p>
        <table className="grid help-table">
          <tbody>
            <tr>
              <td>1. Thông tin chung</td>
              <td>Tên flow, mẫu tên file xuất (dùng {'{MM}'}, {'{YYYY}'}, {'{FLOW}'}, tham số chạy), tên sổ ledger dùng chung.</td>
            </tr>
            <tr>
              <td>2. File đầu vào</td>
              <td>
                Các file lương cần tải và các cột cần đọc. "Tên cột trong file" = các tiêu đề có thể gặp, cách nhau bởi "|"; không phân biệt hoa / thường, khoảng trắng,
                xuống dòng. Khi có dữ liệu mẫu, cột bên phải cho biết tiêu đề nào trong file đã khớp (↔) hoặc <i>không thấy cột</i>.
              </td>
            </tr>
            <tr>
              <td>3. Tham số chạy</td>
              <td>Thông tin người chạy nhập: người lập, người ký, chọn từ bảng master, chọn cost item… Gọi bằng run.&lt;mã&gt;.</td>
            </tr>
            <tr>
              <td>4. Bảng nhân viên</td>
              <td>Mỗi dòng của bảng là một cột tính cho từng nhân viên, theo thứ tự (chỉ dùng cột phía trên). Tương ứng sheet Form 01.</td>
            </tr>
            <tr>
              <td>5. Cost items</td>
              <td>Mỗi khoản: helper, cost code, tên, lấy tiền từ cột nào, kỳ, budget, vào F02 / F03. Bấm ▸ để mở tuỳ chọn thêm (tên EN, phần NLĐ, đổi helper / cost center, bộ lọc đơn vị).</td>
            </tr>
            <tr>
              <td>6. Gộp theo đơn vị</td>
              <td>Bảng đơn vị, cột Dept / Cost Center / Sector, câu diễn giải. Có dữ liệu mẫu thì xem ngay các dòng sau khi gộp.</td>
            </tr>
            <tr>
              <td>7–8. Form 02 / Form 03</td>
              <td>
                Bật / tắt, <b>đợt chạy</b> (Trích / Chi), điều chỉnh theo ledger, <b>ghi vào ledger</b>; <b>Xem trước bản in</b> giống file Excel (bấm tiêu đề cột trên bản
                xem trước để tới cột đó); phần <i>Cột &amp; công thức</i> và <i>Tiêu đề &amp; chữ ký</i>.
              </td>
            </tr>
            <tr>
              <td>9. Kiểm tra</td>
              <td>Điều kiện phải ĐÚNG. Mức <b>Chặn</b> không cho xuất file, <b>Cảnh báo</b> chỉ nhắc. Có dữ liệu mẫu thì mỗi dòng hiện ✓ đạt / ✕ số lần không đạt.</td>
            </tr>
            <tr>
              <td>10. Sheet thêm</td>
              <td>Sheet tổng hợp tuỳ ý (ví dụ Summary của IN), mỗi ô là một công thức tổng.</td>
            </tr>
            <tr>
              <td>Công cụ</td>
              <td>
                <b>Lỗi cấu hình</b> (gom theo bước, bấm để tới chỗ sửa; còn lỗi thì không publish được), <b>Chạy thử</b> đầy đủ như người dùng (file có dòng BẢN CHẠY THỬ),{' '}
                <b>Phiên bản</b> (so sánh, publish lại, huỷ hiệu lực), <b>JSON</b> (nâng cao).
              </td>
            </tr>
          </tbody>
        </table>
        <h3>Thao tác trên bảng</h3>
        <ul>
          <li>Sửa trực tiếp trong ô, như Excel. Di chuột lên tiêu đề cột có gạch chấm để xem giải thích.</li>
          <li>
            Kéo biểu tượng <b>⠿</b> ở đầu dòng để đổi thứ tự (hoặc bấm vào ⠿ rồi dùng phím ↑ / ↓). Thứ tự quan trọng ở bảng nhân viên (cột dưới dùng cột trên) và
            cột Form (thứ tự in).
          </li>
          <li>Cuối dòng: ▸ mở chi tiết (tuỳ chọn ít dùng, danh sách con), nhân bản dòng, xoá dòng. Dòng có lỗi tô đỏ, lỗi ghi ngay dưới dòng.</li>
        </ul>
        <h3>Dữ liệu mẫu — đối chiếu khi đang sửa</h3>
        <p>
          Thanh <b>Dữ liệu mẫu</b> ở đầu mỗi bước: nạp một file lương thật (chỉ đọc trên máy, không gửi lên server, không lưu), chọn tháng / năm, tham số. Cấu hình
          đang sửa được tính lại sau mỗi thay đổi; dưới mỗi công thức hiện <b>= giá trị của nhân viên đang chọn · Σ tổng</b>. Đổi nhân viên ở ô <i>Xem nhân viên</i>{' '}
          để đối chiếu với file Excel cũ. Dữ liệu mẫu dùng master data hiện hành và ledger trống (điều chỉnh = 0); muốn thử với ledger thật dùng <b>Chạy thử</b>.
        </p>
        <h3>Thứ tự làm việc</h3>
        <ol>
          <li>Flow mới: dùng trợ lý <b>Bắt đầu nhanh từ file lương mẫu</b>, rồi làm theo ô <i>Nên làm tiếp</i>.</li>
          <li>Nạp dữ liệu mẫu, đi lần lượt các bước 1 → 10 (nút <i>Bước tiếp</i>), sửa đến khi các số khớp file cũ → <b>Lưu nháp</b> (chưa ảnh hưởng người dùng).</li>
          <li>
            <b>Chạy thử</b> đầy đủ với ledger thật nếu flow dùng ledger, tải file và đối chiếu.
          </li>
          <li>
            <b>Publish</b>: chọn kỳ bắt đầu hiệu lực và ghi chú. Người dùng chạy kỳ đó trở đi sẽ dùng phiên bản mới.
          </li>
          <li>
            Quay lại cấu hình cũ: <b>Phiên bản</b> › <i>Publish lại</i> phiên bản cũ với kỳ hiệu lực mới.
          </li>
        </ol>
        <Tip>
          Ở trang chạy, nếu file lương có tiêu đề cột khác alias, admin có thể chọn cột bằng tay rồi bấm <i>Lưu các cột đã chọn tay làm alias</i> — alias được thêm vào
          bản nháp, cần publish để áp dụng.
        </Tip>
      </>
    ),
  },
  {
    id: 'run',
    title: '6. Chạy flow và sổ ledger',
    body: (
      <>
        <ol>
          <li>
            <Path>Chạy flow</Path> › chọn flow. Chọn <b>kỳ</b> (tháng / năm): ứng dụng tự lấy phiên bản flow và master data của kỳ đó (hiện ở khung bên phải).
          </li>
          <li>
            Chọn <b>đợt chạy</b> (flow có cả trích lẫn chi luôn hỏi, không chọn sẵn): <b>Trích</b> → Form 02; <b>Chi</b> → Form 03; <b>Trích + Chi</b> → cả hai.
          </li>
          <li>Điền tham số (đơn vị, người ký…), tải file lương và <b>file ledger mới nhất</b>.</li>
          <li>
            <b>Tính</b> → xem tab Kiểm tra (lỗi / cảnh báo), bảng nhân viên, Form 02 / 03, tổng theo mã / đơn vị.
          </li>
          <li>
            <b>Tải Form + Ledger</b>: một lần bấm tải cả file Form và file ledger mới. File Form có hậu tố <code>_Trich</code> / <code>_Chi</code> khi chạy riêng một
            đợt.
          </li>
        </ol>
        <h3>Sổ ledger</h3>
        <ul>
          <li>Ledger lưu số trích và số chi của mọi kỳ; số điều chỉnh kỳ này = tổng chi − tổng trích thực tế của các kỳ trước, theo từng khoá.</li>
          <li>Chạy đợt Chi chỉ ghi phần chi, giữ nguyên phần trích đã ghi của kỳ đó (và ngược lại).</li>
          <li>Flow ghi ledger dạng "actual = accrual" (như IN): số chi bằng số trích, không phát sinh điều chỉnh.</li>
          <li>
            Ứng dụng ghi lại dấu (hash) của file ledger mới nhất. Dùng file cũ, file bị sửa tay, hoặc không chọn file khi đã có ledger → có cảnh báo phải xác nhận.
          </li>
          <li>Chạy lại một kỳ đã có trong ledger → hỏi "Thay thế" để ghi đè phần của đợt đang chạy (không nhân đôi).</li>
        </ul>
      </>
    ),
  },
  {
    id: 'users',
    title: '7. Người dùng',
    body: (
      <ul>
        <li>
          <Path>Quản trị › Người dùng</Path> › <b>Tạo tài khoản</b>: tên đăng nhập, tên hiển thị, quyền (admin / user) và mật khẩu tạm (tối thiểu 10 ký tự). Người
          dùng phải đổi mật khẩu ở lần đăng nhập đầu.
        </li>
        <li>
          <b>Đặt lại mật khẩu</b>: tạo mật khẩu tạm mới, các phiên đăng nhập cũ của người đó bị đăng xuất.
        </li>
        <li>
          <b>Khoá</b>: chặn đăng nhập ngay. Nhập sai mật khẩu 5 lần liên tiếp, tài khoản tự khoá 15 phút.
        </li>
        <li>Phiên đăng nhập hết hạn sau 12 giờ.</li>
      </ul>
    ),
  },
  {
    id: 'ui',
    title: '8. Giao diện và văn bản',
    body: (
      <ul>
        <li>
          Nút bút chì ở góc dưới sidebar (hoặc <Path>Quản trị › Giao diện</Path>) bật <b>chế độ chỉnh sửa giao diện</b>. Khi đó <b>mọi chữ trên giao diện</b> đều sửa
          được: rê chuột lên chữ (hiện khung), bấm vào → sửa → <b>Lưu</b>. Thay đổi áp dụng ngay cho mọi người. Alt + bấm để dùng nút / mở link như thường.
        </li>
        <li>
          Chữ có viền nét đứt (tiêu đề trang, menu, hướng dẫn) là văn bản riêng của từng chỗ. Các chữ khác (nút, tiêu đề cột, nhãn, giải thích…) khi sửa sẽ được thay ở{' '}
          <b>mọi chỗ có đúng chữ đó</b>. Chữ có chứa số chỉ thay khi trùng nguyên văn.
        </li>
        <li>
          Không sửa được ở đây: dữ liệu (tên flow, mã, số liệu lương, tên người dùng, bảng master) — sửa ở màn hình của dữ liệu đó. Chữ không bấm được (lựa chọn trong ô
          chọn, chữ gợi ý trong ô nhập, chú thích khi rê chuột): dùng ô <i>Thay một chữ ở mọi nơi</i> ở trang Giao diện.
        </li>
        <li>
          Mỗi trang có khung <b>Hướng dẫn</b> (chỉ hiện khi có nội dung). Trang chạy flow có hướng dẫn chung và hướng dẫn riêng từng flow. Dòng bắt đầu bằng "- " thành
          gạch đầu dòng.
        </li>
        <li>
          Trang <b>Giao diện</b> liệt kê văn bản đã sửa (chữ gốc → chữ mới, khôi phục mặc định từng dòng) và cho sửa chữ của trang đăng nhập qua bản xem trước.
        </li>
        <li>Chế độ sáng / tối / theo hệ thống: nút ở góc dưới sidebar hoặc Tài khoản › Giao diện hiển thị (lưu trên trình duyệt của mỗi người).</li>
      </ul>
    ),
  },
  {
    id: 'backup',
    title: '9. Backup',
    body: (
      <ul>
        <li>
          <b>Xuất backup</b>: một file JSON gồm mọi flow (mọi phiên bản), mọi phiên bản master data và văn bản giao diện. Không có dữ liệu lương. Nên xuất định kỳ và
          sau mỗi lần thay đổi lớn.
        </li>
        <li>
          <b>Nhập backup</b>: master data được <i>thêm</i> phiên bản (phiên bản trùng kỳ bắt đầu và trùng nội dung được bỏ qua, không xoá gì); văn bản giao diện cùng
          tên bị thay thế; cấu hình mỗi flow được nạp thành bản nháp, cần publish kèm kỳ hiệu lực.
        </li>
      </ul>
    ),
  },
  {
    id: 'formula',
    title: '10. Công thức',
    body: (
      <>
        <p>Cú pháp gần giống Excel: + − * / &amp; (nối chữ), so sánh = &lt;&gt; &lt; &gt; &lt;= &gt;=, chữ trong dấu nháy kép "…".</p>
        <table className="grid help-table">
          <tbody>
            <tr>
              <td>
                <code>[cột]</code>
              </td>
              <td>Cột đứng trước, cùng dòng (bảng nhân viên, form).</td>
            </tr>
            <tr>
              <td>
                <code>in.Input.field</code>
              </td>
              <td>Trường của file đầu vào (bảng nhân viên: dòng của chính nhân viên đó).</td>
            </tr>
            <tr>
              <td>
                <code>P.key</code>
              </td>
              <td>Tham số trong bảng Params của kỳ đang chạy.</td>
            </tr>
            <tr>
              <td>
                <code>run.month</code>, <code>run.year</code>, <code>run.&lt;mã&gt;</code>
              </td>
              <td>Kỳ đang chạy và các tham số chạy.</td>
            </tr>
            <tr>
              <td>
                <code>row.field</code>
              </td>
              <td>
                Dòng tổng hợp trên form: no, sector, dept, unit, budgetCode, costCenter, costCode, helper, name, period, description, amount, employeeAmount, count,
                adjusted, actualAccrual.
              </td>
            </tr>
            <tr>
              <td>
                <code>emp.cột</code>, <code>f02.cột</code>, <code>f03.cột</code>
              </td>
              <td>Cả cột của bảng nhân viên / Form 02 / Form 03 (dùng trong SUM, UNITSUM… và kiểm tra phạm vi total).</td>
            </tr>
          </tbody>
        </table>
        <Tip>
          Ô công thức có gợi ý tự động (gõ vài chữ đầu) và báo lỗi ngay khi gõ. ROUND làm tròn như Excel. Chia cho 0 là lỗi và chặn xuất file, không ra số rác.
        </Tip>
        <FormulaReference />
      </>
    ),
  },
  {
    id: 'faq',
    title: '11. Sự cố thường gặp',
    body: (
      <table className="grid help-table">
        <tbody>
          <tr>
            <td>"Chưa tìm thấy cột bắt buộc"</td>
            <td>Tiêu đề trong file lương khác alias. Chọn cột bằng tay trong "Xem / sửa mapping cột", rồi lưu làm alias (admin).</td>
          </tr>
          <tr>
            <td>"Đơn vị không có trong CostCenter"</td>
            <td>Mã bộ phận mới chưa có trong bảng đơn vị của kỳ đang chạy. Thêm dòng vào bảng và lưu phiên bản với hiệu lực từ kỳ đó.</td>
          </tr>
          <tr>
            <td>"Kỳ này chưa có phiên bản flow"</td>
            <td>Phiên bản sớm nhất bắt đầu sau kỳ đang chọn. Publish lại với kỳ hiệu lực sớm hơn, hoặc chọn kỳ khác.</td>
          </tr>
          <tr>
            <td>"File ledger không phải bản mới nhất"</td>
            <td>Có người đã chạy sau và tạo ledger mới hơn. Lấy file ledger mới nhất ở thư mục chung.</td>
          </tr>
          <tr>
            <td>Không publish được</td>
            <td>Còn lỗi ở mục Lỗi cấu hình, hoặc công thức tham chiếu bảng / cột không có trong master data của kỳ hiệu lực đã chọn.</td>
          </tr>
          <tr>
            <td>Người dùng không thấy flow</td>
            <td>Flow chưa publish, hoặc đã bỏ chọn "hiện cho người dùng" ở danh sách Flows.</td>
          </tr>
          <tr>
            <td>Bị khoá đăng nhập</td>
            <td>Sai mật khẩu 5 lần → chờ 15 phút, hoặc admin đặt lại mật khẩu.</td>
          </tr>
        </tbody>
      </table>
    ),
  },
  {
    id: 'deploy',
    title: '12. Cập nhật ứng dụng',
    body: (
      <ul>
        <li>Mã nguồn ở GitHub (izark99/DHG-Tools). Mỗi lần merge vào nhánh main, Cloudflare Pages tự build và deploy (khoảng 2–3 phút).</li>
        <li>
          Khi bản cập nhật có <b>migration mới</b> (thư mục <code>migrations/</code>), phải chạy migration trên database D1 <code>cb-forms</code> <b>trước</b> khi
          merge: <code>npx wrangler d1 migrations apply cb-forms --remote</code>.
        </li>
        <li>Xuất backup trước mỗi lần cập nhật lớn.</li>
      </ul>
    ),
  },
];

export function HelpPage() {
  const [active, setActive] = useState(SECTIONS[0].id);
  // highlight the section being read
  useEffect(() => {
    const root = document.querySelector('.content');
    if (!root) return;
    const onScroll = () => {
      let cur = SECTIONS[0].id;
      for (const s of SECTIONS) {
        const el = document.getElementById(`help-${s.id}`);
        if (el && el.getBoundingClientRect().top < 160) cur = s.id;
      }
      setActive(cur);
    };
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => root.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <>
      <PageHeader
        icon="book"
        crumb={<T k="nav.group.admin">Quản trị</T>}
        title={<T k="help.title">Hướng dẫn sử dụng</T>}
        subtitle={<T k="help.subtitle">Dành cho admin: thiết lập, cấu hình flow, master data theo kỳ, chạy và xử lý sự cố.</T>}
      />
      <div className="help-layout">
        <nav className="help-toc" aria-label="Mục lục">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={active === s.id ? 'help-toc-item active' : 'help-toc-item'}
              onClick={() => {
                setActive(s.id);
                document.getElementById(`help-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              {s.title}
            </button>
          ))}
        </nav>
        <div className="help-body">
          {SECTIONS.map((s) => (
            <section key={s.id} id={`help-${s.id}`} className="help-section">
              <h2>{s.title}</h2>
              {s.body}
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
