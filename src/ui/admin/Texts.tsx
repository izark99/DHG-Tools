// Admin: interface texts. Edit mode is switched on here (or with the pen button in the sidebar);
// the login page is previewed so its texts can be edited too; saved overrides are listed with a reset.
import { useState } from 'react';
import { errMsg } from '../../api';
import { LoginBrand, LoginHead, LoginPoints } from '../Auth';
import { Card, Icon, PageHeader, toast } from '../layout';
import { Guide, resetText, setEditMode, T, useEditMode, useSavedTexts } from '../texts';

export function TextsPage() {
  const on = useEditMode();
  const saved = useSavedTexts();
  const keys = Object.keys(saved).sort();
  const [busy, setBusy] = useState('');
  const reset = async (key: string) => {
    if (!confirm(`Khôi phục văn bản mặc định cho "${key}"?`)) return;
    setBusy(key);
    try {
      await resetText(key);
      toast('ok', 'Đã khôi phục văn bản mặc định.');
    } catch (e) {
      toast('error', errMsg(e));
    } finally {
      setBusy('');
    }
  };
  return (
    <>
      <PageHeader
        icon="pen"
        crumb={<T k="nav.group.admin">Quản trị</T>}
        title={<T k="texts.title">Giao diện</T>}
        subtitle={<T k="texts.subtitle">Sửa tiêu đề, mô tả và hướng dẫn hiển thị cho người dùng. Thay đổi áp dụng ngay cho mọi người.</T>}
        actions={
          <button type="button" className={on ? '' : 'primary'} onClick={() => setEditMode(!on)}>
            <Icon name="pen" size={16} /> {on ? 'Tắt chế độ chỉnh sửa' : 'Bật chế độ chỉnh sửa'}
          </button>
        }
      />
      <Guide
        k="texts.guide"
        fallback={
          'Bật chế độ chỉnh sửa, rồi mở trang cần sửa. Chữ có viền nét đứt là sửa được: bấm vào, sửa, Lưu.\n' +
          '- Viền xanh lá: văn bản đã được sửa (khác mặc định).\n' +
          '- "Thêm hướng dẫn": khung hướng dẫn của trang, chỉ hiện với người dùng khi có nội dung.\n' +
          '- Trang chạy flow có hướng dẫn chung và hướng dẫn riêng cho từng flow.'
        }
      />

      <Card title="Trang đăng nhập (xem trước)">
        <div className="login-preview">
          <div className="auth-modal">
            <LoginBrand />
            <div className="auth-card">
              <LoginHead />
            </div>
            <LoginPoints />
          </div>
        </div>
        {!on && <p className="hint">Bật chế độ chỉnh sửa để sửa trực tiếp trên bản xem trước.</p>}
      </Card>

      <Card title={`Văn bản đã sửa (${keys.length})`}>
        {keys.length ? (
          <div className="table-wrap">
            <table className="grid compact">
              <thead>
                <tr>
                  <th>Khoá</th>
                  <th>Nội dung</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k}>
                    <td>
                      <code>{k}</code>
                    </td>
                    <td className="text-cell">{saved[k] || <span className="muted">(trống)</span>}</td>
                    <td>
                      <button type="button" className="link small" disabled={busy === k} onClick={() => reset(k)}>
                        Khôi phục mặc định
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">Chưa sửa văn bản nào — đang dùng toàn bộ văn bản mặc định.</p>
        )}
      </Card>
    </>
  );
}
