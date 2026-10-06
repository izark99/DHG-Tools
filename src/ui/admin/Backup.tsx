import { useState } from 'react';
import { api, errMsg } from '../../api';
import { Alert, download } from '../common';
import { Card, Icon, PageHeader } from '../layout';
import { Guide, T } from '../texts';

export function BackupPage() {
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  return (
    <>
      <PageHeader
        icon="archive"
        crumb={<T k="nav.group.admin">Quản trị</T>}
        title={<T k="backup.title">Backup cấu hình</T>}
        subtitle={<T k="backup.subtitle">File backup gồm toàn bộ flow (mọi phiên bản), bảng master và văn bản giao diện. Không có dữ liệu lương nào.</T>}
      />
      <Guide k="backup.guide" />
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <Card title={<T k="backup.card">Xuất / nhập</T>}>
      <div className="row gap wrap">
        <button
          type="button"
          className="primary"
          onClick={async () => {
            try {
              const data = await api.backup();
              const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
              download(JSON.stringify(data, null, 2), `cb-forms-backup-${stamp}.json`, 'application/json');
            } catch (e) {
              setMsg({ kind: 'error', text: errMsg(e) });
            }
          }}
        >
          <Icon name="download" size={16} /> Xuất backup (.json)
        </button>
        <label className="button">
          <Icon name="upload" size={16} /> Nhập backup
          <input
            type="file"
            accept=".json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const data = JSON.parse(await f.text());
                if (!confirm('Nhập backup: bảng master cùng tên sẽ bị THAY THẾ; cấu hình mỗi flow được nạp thành BẢN NHÁP (cần publish). Tiếp tục?')) return;
                const r = await api.importBackup(data);
                setMsg({ kind: 'ok', text: `Đã nhập ${r.masters} bảng master, ${r.flows} flow (dạng bản nháp) và ${r.texts} văn bản giao diện.` });
              } catch (e2) {
                setMsg({ kind: 'error', text: errMsg(e2) });
              }
            }}
          />
        </label>
      </div>
      <p className="hint">
        <T k="backup.hint">Nhập backup: bảng master và văn bản giao diện cùng tên bị thay thế; cấu hình mỗi flow được nạp thành bản nháp và cần publish lại.</T>
      </p>
      </Card>
    </>
  );
}
