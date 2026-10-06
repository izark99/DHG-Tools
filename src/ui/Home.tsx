import { api, type User } from '../api';
import { Alert, useAsync } from './common';
import { Icon, PageHeader } from './layout';
import { Guide, T } from './texts';

export function Home({ user }: { user: User }) {
  const flows = useAsync(() => api.flows(), []);
  const runs = useAsync(() => api.runs(), []);
  const last = new Map((runs.data?.latest ?? []).map((r) => [r.flow_id, r]));
  const active = (flows.data?.flows ?? []).filter((f) => f.active);
  const ready = active.filter((f) => f.published).length;
  const latest = [...(runs.data?.latest ?? [])].sort((a, b) => (a.at < b.at ? 1 : -1))[0];
  const hello = user.display_name || user.username;

  return (
    <>
      <PageHeader
        icon="play"
        crumb={<T k="nav.group.run">Vận hành</T>}
        title={<T k="home.title">Chọn flow để chạy</T>}
        subtitle={
          <T k="home.subtitle" vars={{ name: hello }}>
            {'Xin chào {name}. Chọn một flow, tải file lương và xuất Form 02 / Form 03.'}
          </T>
        }
      />
      <Guide k="home.guide" />
      {flows.error && <Alert kind="error">{flows.error}</Alert>}

      <div className="stats">
        <div className="stat">
          <div className="stat-icon">
            <Icon name="flow" />
          </div>
          <div>
            <div className="stat-value">{ready}</div>
            <div className="stat-label">
              <T k="home.stat.ready">Flow sẵn sàng chạy</T>
            </div>
          </div>
        </div>
        <div className="stat">
          <div className="stat-icon">
            <Icon name="history" />
          </div>
          <div>
            <div className="stat-value">{latest ? latest.period : '—'}</div>
            <div className="stat-label">{latest ? `Kỳ chạy gần nhất · ${latest.flow_id} · ${latest.user}` : 'Chưa có lần chạy nào'}</div>
          </div>
        </div>
        <div className="stat">
          <div className="stat-icon">
            <Icon name="shield" />
          </div>
          <div>
            <div className="stat-value">0</div>
            <div className="stat-label">
              <T k="home.stat.server">Dòng lương lưu trên server</T>
            </div>
          </div>
        </div>
      </div>

      <div className="cards">
        {active.map((f) => {
          const r = last.get(f.id);
          return (
            <div key={f.id} className="flow-card">
              <div className="flow-card-top">
                <div className="flow-icon">{f.id.slice(0, 3).toUpperCase()}</div>
                <span className={f.published ? 'pill pill-ok' : 'pill'}>{f.published ? `v${f.published.version}` : 'chưa publish'}</span>
              </div>
              <div className="flow-name">{f.name}</div>
              <div className="flow-meta">{r ? `Lần chạy gần nhất: kỳ ${r.period} · ${r.user} · ${new Date(r.at).toLocaleDateString('vi-VN')}` : 'Chưa chạy lần nào'}</div>
              <div className="flow-card-foot">
                {f.published ? (
                  <a className="button primary" href={`#/run/${encodeURIComponent(f.id)}`}>
                    <Icon name="play" size={16} /> Chạy
                  </a>
                ) : (
                  <span className="muted small">
                    <T k="home.notPublished">Admin cần publish trước khi chạy.</T>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {flows.data && !active.length && (
        <div className="empty">
          <Icon name="flow" size={32} />
          <div>
            <T k="home.empty">Chưa có flow nào.</T>
          </div>
          <div className="muted">
            {user.role === 'admin' ? <T k="home.empty.admin">Vào Quản trị › Flows để tạo flow đầu tiên.</T> : <T k="home.empty.user">Liên hệ quản trị viên.</T>}
          </div>
        </div>
      )}
    </>
  );
}
