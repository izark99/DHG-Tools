import { useState, type FormEvent } from 'react';
import { api, errMsg, type User } from '../api';
import { Alert } from './common';
import { Card, Icon, PageHeader } from './layout';
import { T } from './texts';

/** Heading of the login form. */
export function LoginHead() {
  return (
    <>
      <h2>
        <T k="login.title">Đăng nhập</T>
      </h2>
      <p className="muted">
        <T k="login.sub">Tài khoản do quản trị viên cấp.</T>
      </p>
    </>
  );
}

/** Left panel of the login page (also previewed on Admin › Giao diện, where it can be edited). */
export function LoginBrand() {
  return (
    <div className="auth-brand">
      <div className="brand-logo lg">CB</div>
      <h1>
        <T k="brand.name">C&B Forms</T>
      </h1>
      <p>
        <T k="login.tagline">Tổng hợp trích & chi lương — Form 02 / Form 03 gửi Kế toán.</T>
      </p>
      <ul>
        <li>
          <Icon name="check" /> <T k="login.point1">Dữ liệu lương chỉ xử lý trên trình duyệt của bạn</T>
        </li>
        <li>
          <Icon name="check" /> <T k="login.point2">Cấu hình flow, công thức do admin quản lý</T>
        </li>
        <li>
          <Icon name="check" /> <T k="login.point3">Xuất Excel đúng mẫu in, kèm sổ ledger điều chỉnh</T>
        </li>
      </ul>
    </div>
  );
}

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
    <div className="auth">
      <LoginBrand />
      <div className="auth-form">
        <form className="auth-card" onSubmit={submit}>
          <LoginHead />
          <label className="field">
            <span>Tên đăng nhập</span>
            <input autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <label className="field">
            <span>Mật khẩu</span>
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <div className="msg-slot">{err && <Alert kind="error">{err}</Alert>}</div>
          <button className="primary block" disabled={busy || !username || !password}>
            Đăng nhập
          </button>
        </form>
      </div>
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
    <form className="pw-form" onSubmit={submit}>
      <label className="field">
        Mật khẩu hiện tại
        <input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
      </label>
      <label className="field">
        Mật khẩu mới (≥ 10 ký tự)
        <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
      </label>
      <label className="field">
        Nhập lại mật khẩu mới
        <input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
      </label>
      <div className="msg-slot">
        {err && <Alert kind="error">{err}</Alert>}
        {ok && <Alert kind="ok">Đã đổi mật khẩu. Các phiên đăng nhập khác đã bị đăng xuất.</Alert>}
      </div>
      <button className="primary" disabled={!cur || !next}>
        Đổi mật khẩu
      </button>
    </form>
  );
}

export function ChangePassword({ forced, onDone }: { forced?: boolean; onDone: () => void }) {
  return (
    <div className="auth single">
      <div className="auth-form">
        <div className="auth-card">
          <h2>{forced ? 'Bạn cần đổi mật khẩu tạm trước khi dùng' : 'Đổi mật khẩu'}</h2>
          <p className="muted">Mật khẩu tối thiểu 10 ký tự. Sau khi đổi, các phiên đăng nhập khác sẽ bị đăng xuất.</p>
          <PasswordForm onDone={onDone} />
        </div>
      </div>
    </div>
  );
}

export function Account({ onChanged }: { onChanged: () => void }) {
  return (
    <>
      <PageHeader title={<T k="account.title">Tài khoản</T>} subtitle={<T k="account.subtitle">Đổi mật khẩu đăng nhập</T>} />
      <Card title={<T k="account.card">Đổi mật khẩu</T>} className="narrow-card">
        <PasswordForm onDone={onChanged} />
      </Card>
    </>
  );
}
