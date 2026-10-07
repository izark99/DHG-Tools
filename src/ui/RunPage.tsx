import { useState } from 'react';
import { api, errMsg, type User } from '../api';
import type { FlowConfig } from '../engine/types';
import { Alert, FilePick, readFileText, useAsync } from './common';
import { Card, PageHeader } from './layout';
import { RunWizard } from './RunWizard';
import { Guide, T } from './texts';

/** Run a flow: the wizard uses the published version that applies to the chosen payroll period. */
export function RunPage({ flowId, user }: { flowId: string; user: User }) {
  const data = useAsync(() => api.flows(), [flowId]);
  if (data.loading && !data.data) return <div className="loading">Đang tải cấu hình…</div>;
  if (data.error) return <Alert kind="error">{data.error}</Alert>;
  const f = data.data!.flows.find((x) => x.id === flowId);
  if (!f || !f.versions.some((v) => v.state !== 'cancelled' && v.state !== 'superseded'))
    return <Alert kind="error">Flow "{flowId}" không tồn tại hoặc chưa được publish.</Alert>;
  return <RunWizard key={f.id} flowId={f.id} user={user} testMode={false} />;
}

/** Run a configuration loaded from a JSON file (test run; nothing is recorded). */
export function RunFromFile({ user }: { user: User }) {
  const [config, setConfig] = useState<FlowConfig | null>(null);
  const [loadNo, setLoadNo] = useState(0);
  const [err, setErr] = useState('');
  const [fileName, setFileName] = useState('');
  return (
    <>
      {!config && (
        <>
          <PageHeader
            icon="file"
            crumb={<T k="nav.group.run">Vận hành</T>}
            title={<T k="runFile.title">Chạy thử từ file JSON</T>}
            subtitle={<T k="runFile.subtitle">Kết quả có hậu tố _TEST, không ghi nhật ký và không cập nhật dấu ledger.</T>}
          />
          <Guide k="runFile.guide" />
        </>
      )}
      <Card title={<T k="runFile.card">File cấu hình flow (.json)</T>}>
      <FilePick
        label="Cấu hình flow"
        accept=".json,application/json"
        emptyText="Chưa chọn file (.json) — file xuất từ trình sửa flow (Xuất JSON)"
        fileName={fileName || undefined}
        status={config ? `${fileName} · ${config.id} — ${config.name}` : undefined}
        bad={!!err}
        onFile={async (file) => {
          setErr('');
          setConfig(null);
          setFileName(file?.name ?? '');
          if (!file) return;
          try {
            const j = JSON.parse(await readFileText(file));
            const cfg = j && j.schemaVersion ? j : j?.config;
            if (!cfg || cfg.schemaVersion !== 1) throw new Error('File không phải cấu hình flow (schemaVersion 1)');
            setConfig(cfg);
            setLoadNo((n) => n + 1);
          } catch (e2) {
            setErr(errMsg(e2));
          }
        }}
      />
      {err && <Alert kind="error">{err}</Alert>}
      </Card>
      {config && <RunWizard key={loadNo} config={config} user={user} testMode />}
    </>
  );
}
