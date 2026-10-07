import { useCallback, useEffect, useState } from 'react';
import { api, setUnauthorizedHandler, type User } from '../api';
import { Account, ChangePassword, Login } from './Auth';
import { Home } from './Home';
import { RunPage, RunFromFile } from './RunPage';
import { MastersPage } from './admin/Masters';
import { UsersPage } from './admin/Users';
import { BackupPage } from './admin/Backup';
import { TextsPage } from './admin/Texts';
import { Icon, initials, PAGE_BAR_ID, ThemeToggle, Toaster } from './layout';
import { FlowsPage } from './admin/Flows';
import { FlowEditorPage } from './admin/FlowEditor';
import { editOnClick, EditModeBar, loadTexts, setEditMode, setTextAdmin, T, TextEditor, useEditMode } from './texts';

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
  const editMode = useEditMode();

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
  // texts readable by this session: login-page texts before sign-in, all of them after
  const signedIn = !!user;
  useEffect(() => {
    void loadTexts();
  }, [signedIn]);
  useEffect(() => setTextAdmin(user?.role === 'admin' && !user.must_change_password), [user]);

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
  else if (parts[0] === 'admin' && parts[1] === 'texts') page = <TextsPage />;
  else if (parts[0] === 'admin' && parts[1] === 'flows' && parts[2]) page = <FlowEditorPage flowId={decodeURIComponent(parts[2])} user={user} />;
  else if (parts[0] === 'admin' && parts[1] === 'flows') page = <FlowsPage />;
  else page = <Home user={user} />;

  const nav = (to: string, key: string, label: string, icon: string) => {
    // "Chạy flow" covers the home page and every run page (#/run/<flow>), not #/run-file
    const active = to === '/' ? hash === '/' || hash.startsWith('/run/') : hash.startsWith(to);
    return (
      // in edit mode the whole item edits its label: the active item looks like one big button
      <a href={`#${to}`} className={active ? 'nav-item active' : 'nav-item'} onClick={editOnClick(key, label)}>
        <Icon name={icon} />
        <span>
          <T k={key}>{label}</T>
        </span>
      </a>
    );
  };
  const name = user.display_name || user.username;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">CB</div>
          <div>
            <div className="brand-name">
              <T k="brand.name">C&B Forms</T>
            </div>
            <div className="brand-sub">
              <T k="brand.sub">Compensation & Benefits</T>
            </div>
          </div>
        </div>
        <nav className="nav">
          <div className="nav-group">
            <T k="nav.group.run">Vận hành</T>
          </div>
          {nav('/', 'nav.run', 'Chạy flow', 'play')}
          {nav('/run-file', 'nav.runFile', 'Chạy thử từ JSON', 'file')}
          {isAdmin && (
            <>
              <div className="nav-group">
                <T k="nav.group.admin">Quản trị</T>
              </div>
              {nav('/admin/flows', 'nav.flows', 'Flows', 'flow')}
              {nav('/admin/masters', 'nav.masters', 'Master data', 'table')}
              {nav('/admin/users', 'nav.users', 'Người dùng', 'users')}
              {nav('/admin/texts', 'nav.texts', 'Giao diện', 'pen')}
              {nav('/admin/backup', 'nav.backup', 'Backup cấu hình', 'archive')}
            </>
          )}
        </nav>
        <div className="sidebar-foot">
          <a href="#/account" className="user-chip" title="Tài khoản">
            <span className="avatar">{initials(name)}</span>
            <span className="user-meta">
              <span className="user-name">{name}</span>
              <span className="user-role">{isAdmin ? 'Quản trị viên' : 'Người dùng'}</span>
            </span>
          </a>
          <ThemeToggle />
          {isAdmin && (
            <button
              type="button"
              className={editMode ? 'icon-btn on' : 'icon-btn'}
              title={editMode ? 'Tắt chỉnh sửa giao diện' : 'Chỉnh sửa giao diện (tiêu đề, hướng dẫn)'}
              aria-label="Chỉnh sửa giao diện"
              aria-pressed={editMode}
              onClick={() => setEditMode(!editMode)}
            >
              <Icon name="pen" />
            </button>
          )}
          <button
            type="button"
            className="icon-btn"
            title="Đăng xuất"
            aria-label="Đăng xuất"
            onClick={() => {
              api.logout().finally(() => setUser(null));
            }}
          >
            <Icon name="logout" />
          </button>
        </div>
      </aside>
      {/* Twenty-style page: a white card beside the sidebar; only its content scrolls */}
      <main className="page-card">
        <div id={PAGE_BAR_ID} className="page-bar" />
        <div className="content">
          <div className="content-inner">{page}</div>
        </div>
      </main>
      <Toaster />
      <EditModeBar />
      <TextEditor />
    </div>
  );
}
