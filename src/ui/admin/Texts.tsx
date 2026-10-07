// Admin: interface texts. Edit mode is switched on here (or with the pen button in the sidebar);
// the login page is previewed so its texts can be edited too; saved overrides are listed with a reset.
import { useState } from 'react';
import { errMsg } from '../../api';
import { LoginBrand, LoginHead, LoginPoints } from '../Auth';
import { Card, Icon, PageHeader, toast } from '../layout';
import { Guide, LIT_PREFIX, parseLit, resetText, saveLiteral, setEditMode, T, useEditMode, useSavedTexts } from '../texts';

export function TextsPage() {
  const on = useEditMode();
  const saved = useSavedTexts();
  // literal replacements first (by original text), then keyed texts
  const keys = Object.keys(saved).sort((a, b) => {
    const la = a.startsWith(LIT_PREFIX);
    const lb = b.startsWith(LIT_PREFIX);
    if (la !== lb) return la ? -1 : 1;
    return la ? (parseLit(saved[a])?.from ?? '').localeCompare(parseLit(saved[b])?.from ?? '') : a.localeCompare(b);
  });
  const [busy, setBusy] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const addLiteral = async () => {
    setBusy('lit');
    try {
      await saveLiteral(from, to);
      setFrom('');
      setTo('');
      toast('ok', 'Đã lưu. Chữ được thay ở mọi chỗ có đúng nguyên văn.');
    } catch (e) {
      toast('error', errMsg(e));
    } finally {
      setBusy('');
    }
  };
  const reset = async (key: string) => {
    const lit = parseLit(saved[key]);
    if (!confirm(`Khôi phục văn bản mặc định cho "${lit ? lit.from : key}"?`)) return;
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

      <Card title="Thay một chữ ở mọi nơi">
        <p className="muted small">
          Dùng cho chữ không bấm vào được (lựa chọn trong ô chọn, chữ gợi ý trong ô nhập, chú thích khi rê chuột). Gõ đúng nguyên văn chữ đang hiện và chữ muốn thay;
          mọi chỗ có đúng chữ đó sẽ đổi.
        </p>
        <div className="form-grid">
          <label>
            Chữ đang hiện
            <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="ví dụ: Lương thời gian" />
          </label>
          <label>
            Thay bằng
            <input value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <div className="form-actions">
            <button type="button" className="primary" disabled={!from.trim() || busy === 'lit'} onClick={addLiteral}>
              Lưu
            </button>
          </div>
        </div>
      </Card>

      <Card title={`Văn bản đã sửa (${keys.length})`}>
        {keys.length ? (
          <div className="table-wrap">
            <table className="grid compact">
              <thead>
                <tr>
                  <th>Chữ gốc / khoá</th>
                  <th>Nội dung hiện tại</th>
                  <th />
                </tr>
              </thead>
              <tbody data-no-text-edit="">
                {keys.map((k) => {
                  const lit = parseLit(saved[k]);
                  return (
                  <tr key={k}>
                    <td className="text-cell">{lit ? lit.from : <code>{k}</code>}</td>
                    <td className="text-cell">{(lit ? lit.to : saved[k]) || <span className="muted">(trống)</span>}</td>
                    <td>
                      <button type="button" className="link small" disabled={busy === k} onClick={() => reset(k)}>
                        Khôi phục mặc định
                      </button>
                    </td>
                  </tr>
                  );
                })}
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
