import { useState } from 'react';
import { api, errMsg, type User } from '../../api';
import { Alert, useAsync } from '../common';
import { Card, initials, PageHeader } from '../layout';
import { Guide, T } from '../texts';

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
    <>
      <PageHeader
        icon="users"
        crumb={<T k="nav.group.admin">Quản trị</T>}
        title={<T k="users.title">Người dùng</T>}
        subtitle={<T k="users.subtitle">Tạo tài khoản với mật khẩu tạm, phân quyền, đặt lại mật khẩu, khoá tài khoản.</T>}
      />
      <Guide k="users.guide" />
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      {list.error && <Alert kind="error">{list.error}</Alert>}
      <Card title={<T k="users.list">Danh sách tài khoản</T>}>
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
                  <td data-no-text-edit="">
                    <span className="user-cell">
                      <span className="avatar sm">{initials(u.display_name || u.username)}</span>
                      {u.username}
                    </span>
                  </td>
                  <td data-no-text-edit="">{u.display_name}</td>
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
                    <span className={u.active ? 'pill pill-ok' : 'pill pill-bad'}>{u.active ? 'Đang dùng' : 'Đã khoá'}</span>
                    {u.must_change_password ? <span className="pill pill-warn">chờ đổi mật khẩu</span> : null}
                    {locked ? <span className="pill pill-bad">tạm khoá</span> : null}
                  </td>
                  <td className="small">{new Date(u.created_at).toLocaleDateString('vi-VN')}</td>
                  <td className="row gap">
                    <button
                      type="button"
                      className="sm"
                      onClick={() => {
                        const p = tempPassword();
                        act(() => api.patchUser(u.username, { password: p }), `Mật khẩu tạm mới của ${u.username}: ${p} — gửi riêng cho người dùng; họ phải đổi khi đăng nhập.`);
                      }}
                    >
                      Đặt lại mật khẩu
                    </button>
                    {locked && (
                      <button type="button" className="sm" onClick={() => act(() => api.patchUser(u.username, { unlock: true }), 'Đã mở khoá.')}>
                        Mở khoá
                      </button>
                    )}
                    {u.username !== me.username && (
                      <button type="button" className="sm" onClick={() => act(() => api.patchUser(u.username, { active: !u.active }), u.active ? 'Đã khoá tài khoản.' : 'Đã mở lại tài khoản.')}>
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
      </Card>

      <Card title={<T k="users.new">Tạo tài khoản</T>}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          act(() => api.createUser(form), `Đã tạo ${form.username}. Mật khẩu tạm: ${form.password} — người dùng phải đổi khi đăng nhập lần đầu.`).then(() =>
            setForm({ username: '', display_name: '', role: 'user', password: tempPassword() }),
          );
        }}
      >
        <div className="form-grid">
          <label className="field">
            Tên đăng nhập
            <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })} />
          </label>
          <label className="field">
            Tên hiển thị
            <input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
          </label>
          <label className="field">
            Quyền
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
          </label>
          <label className="field">
            Mật khẩu tạm (≥ 10 ký tự)
            <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </label>
        </div>
        <button className="primary" disabled={!form.username || form.password.length < 10}>
          Tạo tài khoản
        </button>
      </form>
      </Card>
    </>
  );
}
