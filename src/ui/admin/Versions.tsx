// Version list, JSON diff, re-publish an older version (rollback = publish it again as a new version).
import { useState } from 'react';
import { api, errMsg } from '../../api';
import type { FlowConfig } from '../../engine/types';
import { Alert } from '../common';

type DiffLine = { op: ' ' | '+' | '-'; text: string };

export function lineDiff(a: string[], b: string[]): DiffLine[] {
  const n = a.length;
  const m = b.length;
  if (n * m > 25_000_000) return [...a.map((t) => ({ op: '-' as const, text: t })), ...b.map((t) => ({ op: '+' as const, text: t }))];
  const w = m + 1;
  const L = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) L[i * w + j] = a[i] === b[j] ? L[(i + 1) * w + j + 1] + 1 : Math.max(L[(i + 1) * w + j], L[i * w + j + 1]);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: ' ', text: a[i] });
      i++;
      j++;
    } else if (L[(i + 1) * w + j] >= L[i * w + j + 1]) out.push({ op: '-', text: a[i++] });
    else out.push({ op: '+', text: b[j++] });
  }
  while (i < n) out.push({ op: '-', text: a[i++] });
  while (j < m) out.push({ op: '+', text: b[j++] });
  return out;
}

function DiffView({ left, right }: { left: string; right: string }) {
  const d = lineDiff(left.split('\n'), right.split('\n'));
  const changed = d.filter((x) => x.op !== ' ').length;
  // show changed lines with 3 lines of context
  const keep = new Set<number>();
  d.forEach((x, i) => {
    if (x.op !== ' ') for (let k = i - 3; k <= i + 3; k++) keep.add(k);
  });
  return (
    <div>
      <p className="muted small">{changed ? `${changed} dòng khác nhau` : 'Giống hệt nhau'}</p>
      <pre className="diff">
        {d.map((x, i) =>
          keep.has(i) ? (
            <div key={i} className={x.op === '+' ? 'add' : x.op === '-' ? 'del' : undefined}>
              {x.op} {x.text}
            </div>
          ) : keep.has(i - 1) ? (
            <div key={i} className="muted">
              …
            </div>
          ) : null,
        )}
      </pre>
    </div>
  );
}

export function Versions({
  flowId,
  versions,
  current,
  onRepublished,
}: {
  flowId: string;
  versions: { version: number; created_by: string; created_at: string }[];
  current: FlowConfig;
  onRepublished: () => void;
}) {
  const [view, setView] = useState<{ version: number; config: FlowConfig } | null>(null);
  const [against, setAgainst] = useState<'current' | number>('current');
  const [other, setOther] = useState<FlowConfig | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const load = async (v: number) => {
    setMsg(null);
    try {
      const r = await api.version(flowId, v);
      setView({ version: v, config: r.config });
    } catch (e) {
      setMsg({ kind: 'error', text: errMsg(e) });
    }
  };

  return (
    <div>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      {!versions.length && <p className="muted">Chưa có phiên bản nào được publish.</p>}
      <div className="table-wrap">
      <table className="grid">
        <thead>
          <tr>
            <th>Phiên bản</th>
            <th>Người publish</th>
            <th>Lúc</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {versions.map((v, i) => (
            <tr key={v.version}>
              <td>
                v{v.version}
                {i === 0 ? ' (đang dùng)' : ''}
              </td>
              <td>{v.created_by}</td>
              <td>{new Date(v.created_at).toLocaleString('vi-VN')}</td>
              <td className="row gap">
                <button type="button" className="sm" onClick={() => load(v.version)}>
                  Xem / so sánh
                </button>
                {i > 0 && (
                  <button
                    type="button"
                    className="sm"
                    onClick={async () => {
                      if (!confirm(`Publish lại v${v.version} thành phiên bản mới (rollback)?`)) return;
                      try {
                        const r = await api.publish(flowId, v.version);
                        setMsg({ kind: 'ok', text: `Đã publish lại v${v.version} thành v${r.version}.` });
                        onRepublished();
                      } catch (e) {
                        setMsg({ kind: 'error', text: errMsg(e) });
                      }
                    }}
                  >
                    Publish lại
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {view && (
        <div className="card diff-card">
          <div className="row gap">
            <strong>v{view.version}</strong> so với
            <select
              value={String(against)}
              onChange={async (e) => {
                const val = e.target.value;
                if (val === 'current') {
                  setAgainst('current');
                  setOther(null);
                } else {
                  setAgainst(Number(val));
                  setOther((await api.version(flowId, Number(val))).config);
                }
              }}
            >
              <option value="current">cấu hình đang sửa</option>
              {versions
                .filter((v) => v.version !== view.version)
                .map((v) => (
                  <option key={v.version} value={v.version}>
                    v{v.version}
                  </option>
                ))}
            </select>
          </div>
          <DiffView left={JSON.stringify(view.config, null, 2)} right={JSON.stringify(against === 'current' ? current : (other ?? {}), null, 2)} />
        </div>
      )}
    </div>
  );
}
