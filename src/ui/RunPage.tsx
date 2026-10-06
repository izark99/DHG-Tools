import { useState } from 'react';
import { api, errMsg, type User } from '../api';
import type { FlowConfig } from '../engine/types';
import { Alert, readFileText, useAsync } from './common';
import { Card, PageHeader } from './layout';
import { RunWizard } from './RunWizard';
import { Guide, T } from './texts';

/** Run the latest published version of a flow. */
export function RunPage({ flowId, user }: { flowId: string; user: User }) {
  const data = useAsync(async () => {
    const [flows, masters] = await Promise.all([api.flows(), api.masters()]);
    return { flow: flows.flows.find((f) => f.id === flowId) ?? null, masters: masters.tables };
  }, [flowId]);
  if (data.loading) return <div className="loading">Đang tải cấu hình…</div>;
  if (data.error) return <Alert kind="error">{data.error}</Alert>;
  const f = data.data!.flow;
  if (!f || !f.published) return <Alert kind="error">Flow "{flowId}" không tồn tại hoặc chưa được publish.</Alert>;
  return (
    <RunWizard
      key={`${f.id}-${f.published.version}`}
      config={f.published.config}
      version={f.published.version}
      masters={data.data!.masters}
      user={user}
      testMode={false}
    />
  );
}

/** Run a configuration loaded from a JSON file (test run; nothing is recorded). */
export function RunFromFile({ user }: { user: User }) {
  const [config, setConfig] = useState<FlowConfig | null>(null);
  const [loadNo, setLoadNo] = useState(0);
  const [err, setErr] = useState('');
  const masters = useAsync(() => api.masters(), []);
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
      <input
        type="file"
        accept=".json,application/json"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          setErr('');
          setConfig(null);
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
      {masters.error && <Alert kind="error">{masters.error}</Alert>}
      </Card>
      {config && masters.data && <RunWizard key={loadNo} config={config} version={null} masters={masters.data.tables} user={user} testMode />}
    </>
  );
}
