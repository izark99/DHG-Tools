import { api, type User } from '../api';
import { Alert, useAsync } from './common';

export function Home({ user }: { user: User }) {
  const flows = useAsync(() => api.flows(), []);
  const runs = useAsync(() => api.runs(), []);
  const last = new Map((runs.data?.latest ?? []).map((r) => [r.flow_id, r]));
  return (
    <section>
      <h2>Chọn flow để chạy</h2>
      {flows.error && <Alert kind="error">{flows.error}</Alert>}
      <div className="cards">
        {(flows.data?.flows ?? [])
          .filter((f) => f.active)
          .map((f) => {
            const r = last.get(f.id);
            return (
              <div key={f.id} className="card flow-card">
                <h3>{f.name}</h3>
                <div className="muted">
                  {f.id} · {f.published ? `phiên bản ${f.published.version}` : 'chưa publish'}
                </div>
                <div className="muted small">
                  {r ? `Lần chạy gần nhất: kỳ ${r.period} — ${r.user}, ${new Date(r.at).toLocaleString('vi-VN')}` : 'Chưa chạy lần nào'}
                </div>
                {f.published ? (
                  <a className="button primary" href={`#/run/${encodeURIComponent(f.id)}`}>
                    Chạy
                  </a>
                ) : (
                  <span className="muted small">Admin cần publish flow trước khi chạy.</span>
                )}
              </div>
            );
          })}
      </div>
      {flows.data && !flows.data.flows.length && <p className="muted">Chưa có flow nào. {user.role === 'admin' ? 'Vào mục Flows để tạo.' : 'Liên hệ admin.'}</p>}
      <p className="small">
        <a href="#/run-file">Chạy với file cấu hình JSON (chạy thử, không ghi nhận)</a>
      </p>
    </section>
  );
}
