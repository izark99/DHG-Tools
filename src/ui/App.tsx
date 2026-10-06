import { useCallback, useEffect, useState } from 'react';
import { api, setUnauthorizedHandler, type User } from '../api';
import { Account, ChangePassword, Login } from './Auth';
import { Home } from './Home';
import { RunPage, RunFromFile } from './RunPage';
import { MastersPage } from './admin/Masters';
import { UsersPage } from './admin/Users';
import { BackupPage } from './admin/Backup';
import { FlowsPage } from './admin/Flows';
import { FlowEditorPage } from './admin/FlowEditor';

function useHash(): string {
  const [h, setH] = useState(() => window.location.hash.slice(1) || '/');
  useEffect(() => {
    const f = () => setH(window.location.hash.slice(1) || '/');
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return h;
}

export const go = (path: string) => {
  window.location.hash = path;
};

export function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const hash = useHash();

  const refresh = useCallback(() => {
    api.me().then(
      (r) => setUser(r.user),
      () => setUser(null),
    );
  }, []);
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    refresh();
  }, [refresh]);

  if (user === undefined) return <div className="center muted">Đang tải…</div>;
  if (user === null) return <Login onLogin={setUser} />;
  if (user.must_change_password) return <ChangePassword forced onDone={refresh} />;

  const isAdmin = user.role === 'admin';
  const parts = hash.split('/').filter(Boolean);
  let page;
  if (parts[0] === 'run' && parts[1]) page = <RunPage flowId={decodeURIComponent(parts[1])} user={user} />;
  else if (parts[0] === 'run-file') page = <RunFromFile user={user} />;
  else if (parts[0] === 'account') page = <Account onChanged={refresh} />;
  else if (parts[0] === 'admin' && !isAdmin) page = <div className="alert alert-error">Chỉ admin được vào trang này.</div>;
  else if (parts[0] === 'admin' && parts[1] === 'masters') page = <MastersPage />;
  else if (parts[0] === 'admin' && parts[1] === 'users') page = <UsersPage me={user} />;
  else if (parts[0] === 'admin' && parts[1] === 'backup') page = <BackupPage />;
  else if (parts[0] === 'admin' && parts[1] === 'flows' && parts[2]) page = <FlowEditorPage flowId={decodeURIComponent(parts[2])} user={user} />;
  else if (parts[0] === 'admin' && parts[1] === 'flows') page = <FlowsPage />;
  else page = <Home user={user} />;

  const link = (to: string, label: string) => (
    <a href={`#${to}`} className={hash === to || (to !== '/' && hash.startsWith(to)) ? 'active' : undefined}>
      {label}
    </a>
  );

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">C&amp;B Forms</span>
        <nav>
          {link('/', 'Trang chủ')}
          {isAdmin && link('/admin/flows', 'Flows')}
          {isAdmin && link('/admin/masters', 'Master data')}
          {isAdmin && link('/admin/users', 'Người dùng')}
          {isAdmin && link('/admin/backup', 'Backup')}
        </nav>
        <span className="spacer" />
        <a href="#/account">{user.display_name || user.username}</a>
        <button
          type="button"
          className="link"
          onClick={() => {
            api.logout().finally(() => setUser(null));
          }}
        >
          Đăng xuất
        </button>
      </header>
      <main>{page}</main>
    </div>
  );
}
