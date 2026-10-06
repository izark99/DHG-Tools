// Effective-dated versions (flows and master tables): the dialog that saves a change as a new
// version from a payroll period, and the version timeline with its actions.
import { useState, type ReactNode } from 'react';
import type { VersionInfo } from '../../api';
import { addMonths, BEGINNING, currentPeriod, periodLabel, STATE_LABEL, timeline, type SpanState } from '../../engine/effective';
import { Modal } from '../layout';

const STATE_PILL: Record<SpanState, string> = {
  current: 'pill pill-ok',
  past: 'pill',
  future: 'pill pill-warn',
  superseded: 'pill pill-ghost',
  cancelled: 'pill pill-bad',
};

export const range = (v: { effective_from: string; effective_to: string | null }) => `${periodLabel(v.effective_from)} → ${periodLabel(v.effective_to)}`;

export function StatePill({ state }: { state: VersionInfo['state'] }) {
  return <span className={STATE_PILL[state]}>{STATE_LABEL[state]}</span>;
}

/** Ranges after adding a version starting at `from` (preview shown before saving). */
function preview(versions: VersionInfo[], from: string, today: string) {
  const next = Math.max(0, ...versions.map((v) => v.version)) + 1;
  const all = [
    ...versions.map((v) => ({ version: v.version, effectiveFrom: v.effective_from, cancelled: v.state === 'cancelled' })),
    { version: next, effectiveFrom: from, cancelled: false },
  ];
  return { next, spans: timeline(all, today).filter((s) => s.state !== 'cancelled') };
}

/**
 * Ask for the first payroll period of a new version (default: the current period) and a note,
 * show how every version's range will look, then call `onSave`.
 */
export function EffectiveDialog({
  title,
  what,
  versions,
  onSave,
  onClose,
  saveLabel = 'Lưu phiên bản mới',
  extra,
}: {
  title: string;
  /** "flow HQ" / "bảng Params" */
  what: string;
  versions: VersionInfo[];
  onSave: (effectiveFrom: string, note: string) => Promise<void>;
  onClose: () => void;
  saveLabel?: string;
  extra?: ReactNode;
}) {
  const today = currentPeriod();
  const [month, setMonth] = useState(Number(today.slice(5)));
  const [yearText, setYearText] = useState(today.slice(0, 4));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const year = Number(yearText);
  const valid = Number.isInteger(year) && year >= 2000 && year <= 2100;
  const from = `${valid ? year : today.slice(0, 4)}-${String(month).padStart(2, '0')}`;
  const { next, spans } = preview(versions, from, today);
  const replaced = versions.find((v) => v.effective_from === from && (v.state === 'current' || v.state === 'past' || v.state === 'future'));
  const previous = spans.find((s) => s.item.version !== next && s.to === addMonths(from, -1));

  const save = async () => {
    setBusy(true);
    try {
      await onSave(from, note.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy}>
            Huỷ
          </button>
          <button type="button" className="primary" onClick={save} disabled={busy || !valid}>
            {saveLabel}
          </button>
        </>
      }
    >
      <p className="muted">
        Thay đổi của {what} được lưu thành <b>phiên bản v{next}</b>, có hiệu lực từ kỳ chọn dưới đây. Các phiên bản cũ được giữ nguyên và vẫn áp dụng cho các kỳ
        trước đó — chạy lại kỳ cũ cho ra kết quả như cũ.
      </p>
      <div className="form-grid">
        <label className="field">
          <span>Hiệu lực từ tháng</span>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} aria-label="Hiệu lực từ tháng">
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Năm</span>
          <input type="number" min={2000} max={2100} value={yearText} onChange={(e) => setYearText(e.target.value)} aria-label="Hiệu lực từ năm" />
        </label>
        <label className="field wide">
          <span>Ghi chú thay đổi (tuỳ chọn)</span>
          <input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: Lương cơ sở mới theo Nghị định…" aria-label="Ghi chú thay đổi" />
        </label>
      </div>
      {extra}
      {valid && (
        <div className="effect-preview">
          <div className="effect-title">Sau khi lưu</div>
          <ul>
            {spans
              .filter((s) => s.state !== 'superseded')
              .sort((a, b) => (a.from < b.from ? 1 : -1))
              .map((s) => (
                <li key={s.item.version} className={s.item.version === next ? 'new' : undefined}>
                  <span className="effect-v">v{s.item.version}</span>
                  <span>{range({ effective_from: s.from, effective_to: s.to })}</span>
                  {s.item.version === next && <span className="pill pill-ok">mới</span>}
                </li>
              ))}
          </ul>
          {replaced && <div className="hint">v{replaced.version} cũng bắt đầu từ {periodLabel(from)} nên sẽ bị thay thế (vẫn được lưu trong lịch sử).</div>}
          {previous && <div className="hint">v{previous.item.version} sẽ chỉ còn hiệu lực đến {periodLabel(previous.to)}.</div>}
          {from < today && <div className="hint warn-text">Hiệu lực lùi về quá khứ: chạy lại các kỳ từ {periodLabel(from)} sẽ dùng phiên bản mới.</div>}
        </div>
      )}
    </Modal>
  );
}

/** Version timeline: number, range, state, note, author; `actions` renders the buttons of a row. */
export function VersionTable({ versions, actions, selected }: { versions: VersionInfo[]; actions: (v: VersionInfo) => ReactNode; selected?: number }) {
  if (!versions.length) return <p className="muted">Chưa có phiên bản nào.</p>;
  return (
    <div className="table-wrap">
      <table className="grid versions">
        <thead>
          <tr>
            <th>Phiên bản</th>
            <th>Hiệu lực</th>
            <th>Trạng thái</th>
            <th>Ghi chú</th>
            <th>Người tạo</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {versions.map((v) => (
            <tr key={v.version} className={selected === v.version ? 'selected' : undefined}>
              <td>v{v.version}</td>
              <td className="nowrap">
                {v.state === 'superseded' || v.state === 'cancelled' ? (v.effective_from <= BEGINNING ? 'từ đầu' : `từ ${periodLabel(v.effective_from)}`) : range(v)}
              </td>
              <td>
                <StatePill state={v.state} />
              </td>
              <td className="text-cell">{v.note || <span className="muted">—</span>}</td>
              <td className="nowrap">
                {v.by ?? '—'}
                <div className="muted small">{new Date(v.at).toLocaleString('vi-VN')}</div>
                {v.cancelled_by && <div className="muted small">huỷ bởi {v.cancelled_by}</div>}
              </td>
              <td className="actions-cell">
                <div className="row gap">{actions(v)}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
