import { useState } from 'react';
import { api, errMsg, type User } from '../../api';
import { Alert, useAsync } from '../common';

function tempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const b = new Uint32Array(12);
  crypto.getRandomValues(b);
  return [...b].map((x) => chars[x % chars.length]).join('');
}

export function UsersPage({ me }: { me: User }) {
  const list = useAsync(() => api.users(), []);
  const [form, setForm] = useState({ username: '', display_name: '', role: 'user', password: tempPassword() });
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try {
      await fn();
      setMsg({ kind: 'ok', text: ok });
      list.reload();
    } catch (e) {
      setMsg({ kind: 'error', text: errMsg(e) });
    }
  };

  return (
    <section>
      <h2>Người dùng</h2>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      {list.error && <Alert kind="error">{list.error}</Alert>}
      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th>Tên đăng nhập</th>
              <th>Tên hiển thị</th>
              <th>Quyền</th>
              <th>Trạng thái</th>
              <th>Tạo lúc</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(list.data?.users ?? []).map((u) => {
              const locked = u.locked_until && u.locked_until > new Date().toISOString();
              return (
                <tr key={u.username} className={u.active ? undefined : 'muted'}>
                  <td>{u.username}</td>
                  <td>{u.display_name}</td>
                  <td>
                    <select
                      value={u.role}
                      disabled={u.username === me.username}
                      onChange={(e) => act(() => api.patchUser(u.username, { role: e.target.value }), 'Đã đổi quyền.')}
                    >
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td>
                    {u.active ? 'Đang dùng' : 'Đã khoá'}
                    {u.must_change_password ? ' · chờ đổi mật khẩu' : ''}
                    {locked ? ' · tạm khoá do sai mật khẩu' : ''}
                  </td>
                  <td className="small">{new Date(u.created_at).toLocaleDateString('vi-VN')}</td>
                  <td className="row gap">
                    <button
                      type="button"
                      onClick={() => {
                        const p = tempPassword();
                        act(() => api.patchUser(u.username, { password: p }), `Mật khẩu tạm mới của ${u.username}: ${p} — gửi riêng cho người dùng; họ phải đổi khi đăng nhập.`);
                      }}
                    >
                      Đặt lại mật khẩu
                    </button>
                    {locked && (
                      <button type="button" onClick={() => act(() => api.patchUser(u.username, { unlock: true }), 'Đã mở khoá.')}>
                        Mở khoá
                      </button>
                    )}
                    {u.username !== me.username && (
                      <button type="button" onClick={() => act(() => api.patchUser(u.username, { active: !u.active }), u.active ? 'Đã khoá tài khoản.' : 'Đã mở lại tài khoản.')}>
                        {u.active ? 'Khoá' : 'Mở lại'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          act(() => api.createUser(form), `Đã tạo ${form.username}. Mật khẩu tạm: ${form.password} — người dùng phải đổi khi đăng nhập lần đầu.`).then(() =>
            setForm({ username: '', display_name: '', role: 'user', password: tempPassword() }),
          );
        }}
      >
        <h3>Tạo tài khoản</h3>
        <div className="form-grid">
          <label>
            Tên đăng nhập
            <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })} />
          </label>
          <label>
            Tên hiển thị
            <input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
          </label>
          <label>
            Quyền
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
          </label>
          <label>
            Mật khẩu tạm (≥ 10 ký tự)
            <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </label>
        </div>
        <button className="primary" disabled={!form.username || form.password.length < 10}>
          Tạo
        </button>
      </form>
    </section>
  );
}
