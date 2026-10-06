import { useState, type FormEvent } from 'react';
import { api, errMsg, type User } from '../api';
import { Alert } from './common';

export function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const r = await api.login(username, password);
      setPassword('');
      onLogin(r.user);
    } catch (e2) {
      setErr(errMsg(e2));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="center">
      <form className="card login" onSubmit={submit}>
        <h1>C&amp;B Forms</h1>
        <label>
          Tên đăng nhập
          <input autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label>
          Mật khẩu
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {err && <Alert kind="error">{err}</Alert>}
        <button className="primary" disabled={busy || !username || !password}>
          Đăng nhập
        </button>
      </form>
    </div>
  );
}

function PasswordForm({ onDone }: { onDone: () => void }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    if (next !== again) return setErr('Hai lần nhập mật khẩu mới không khớp');
    if (next.length < 10) return setErr('Mật khẩu tối thiểu 10 ký tự');
    try {
      await api.changePassword(cur, next);
      setOk(true);
      setCur('');
      setNext('');
      setAgain('');
      onDone();
    } catch (e2) {
      setErr(errMsg(e2));
    }
  };
  return (
    <form className="card login" onSubmit={submit}>
      <label>
        Mật khẩu hiện tại
        <input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
      </label>
      <label>
        Mật khẩu mới (≥ 10 ký tự)
        <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
      </label>
      <label>
        Nhập lại mật khẩu mới
        <input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
      </label>
      {err && <Alert kind="error">{err}</Alert>}
      {ok && <Alert kind="ok">Đã đổi mật khẩu. Các phiên đăng nhập khác đã bị đăng xuất.</Alert>}
      <button className="primary" disabled={!cur || !next}>
        Đổi mật khẩu
      </button>
    </form>
  );
}

export function ChangePassword({ forced, onDone }: { forced?: boolean; onDone: () => void }) {
  return (
    <div className="center">
      <div>
        <h2>{forced ? 'Bạn cần đổi mật khẩu tạm trước khi dùng' : 'Đổi mật khẩu'}</h2>
        <PasswordForm onDone={onDone} />
      </div>
    </div>
  );
}

export function Account({ onChanged }: { onChanged: () => void }) {
  return (
    <section>
      <h2>Tài khoản</h2>
      <PasswordForm onDone={onChanged} />
    </section>
  );
}
