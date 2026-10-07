import { useState } from 'react';
import { api, errMsg } from '../../api';
import type { FlowConfig } from '../../engine/types';
import { Alert, FilePick, useAsync } from '../common';
import { Card, Icon, PageHeader } from '../layout';
import { blankConfig } from './blank';
import { Guide, T } from '../texts';

export function FlowsPage() {
  const list = useAsync(() => api.flows(), []);
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [fromFile, setFromFile] = useState<FlowConfig | null>(null);
  const [fromName, setFromName] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const create = async () => {
    setMsg(null);
    try {
      const cfg = fromFile ? { ...fromFile, id, name: name || fromFile.name } : blankConfig(id, name || id);
      await api.createFlow(id, name || cfg.name, cfg);
      window.location.hash = `/admin/flows/${encodeURIComponent(id)}`;
    } catch (e) {
      setMsg({ kind: 'error', text: errMsg(e) });
    }
  };

  return (
    <>
      <PageHeader
        icon="flow"
        crumb={<T k="nav.group.admin">Quản trị</T>}
        title={<T k="flows.title">Flows</T>}
        subtitle={<T k="flows.subtitle">Mỗi flow là một bộ cấu hình: input, công thức, cost item, Form 02/03, kiểm tra. Người dùng luôn chạy phiên bản publish mới nhất.</T>}
      />
      <Guide k="flows.guide" />
      {list.error && <Alert kind="error">{list.error}</Alert>}
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <Card title={<T k="flows.list">Danh sách flow</T>}>
      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th>Thứ tự</th>
              <th>Mã</th>
              <th>Tên</th>
              <th>Phiên bản đang dùng</th>
              <th>Bản nháp</th>
              <th>Trạng thái</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(list.data?.flows ?? []).map((f) => (
              <tr key={f.id}>
                <td>
                  <input
                    type="number"
                    className="cell num narrow"
                    defaultValue={f.sort}
                    onBlur={(e) => Number(e.target.value) !== f.sort && api.patchFlow(f.id, { sort: Number(e.target.value) }).then(list.reload)}
                  />
                </td>
                <td>{f.id}</td>
                <td>{f.name}</td>
                <td>
                  {f.published ? (
                    <>
                      <span className="pill pill-ok">v{f.published.version}</span> <span className="muted small">{f.published.by} · {new Date(f.published.at).toLocaleString('vi-VN')}</span>
                    </>
                  ) : (
                    <span className="pill">chưa publish</span>
                  )}
                </td>
                <td>{f.hasDraft ? <span className="pill pill-warn">có bản nháp</span> : null}</td>
                <td>
                  <label className="check">
                    <input type="checkbox" checked={f.active} onChange={(e) => api.patchFlow(f.id, { active: e.target.checked }).then(list.reload)} /> hiện cho người dùng
                  </label>
                </td>
                <td>
                  <a className="button sm" href={`#/admin/flows/${encodeURIComponent(f.id)}`}>
                    Sửa cấu hình
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </Card>

      <Card title={<T k="flows.new">Tạo flow mới</T>}>
        <div className="form-grid">
          <label className="field">
            Mã flow (A-Z, 0-9, _)
            <input value={id} onChange={(e) => setId(e.target.value.trim())} />
          </label>
          <label className="field">
            Tên
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="wide">
            <FilePick
              label="Bắt đầu từ file cấu hình JSON (tuỳ chọn)"
              accept=".json,application/json"
              emptyText="Chưa chọn file (.json) — bỏ trống thì bắt đầu từ cấu hình trống"
              fileName={fromName || undefined}
              status={fromFile ? `${fromName} · ${fromFile.inputs?.length ?? 0} input · ${fromFile.costItems?.length ?? 0} cost item` : undefined}
              onFile={async (f) => {
                setFromFile(null);
                setFromName(f?.name ?? '');
                if (!f) return;
                try {
                  const j = JSON.parse(await f.text());
                  const cfg = j?.schemaVersion ? j : j?.config;
                  if (!cfg || cfg.schemaVersion !== 1) throw new Error('Không phải cấu hình flow');
                  setFromFile(cfg);
                  if (!id) setId(cfg.id ?? '');
                  if (!name) setName(cfg.name ?? '');
                } catch (e2) {
                  setMsg({ kind: 'error', text: errMsg(e2) });
                }
              }}
            />
          </div>
        </div>
        <button type="button" className="primary" disabled={!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(id)} onClick={create}>
          <Icon name="plus" size={16} /> Tạo (thành bản nháp)
        </button>
      </Card>
    </>
  );
}
