// Flow editor, organised as numbered setup steps (plus an overview). Every list is an editable grid
// with drag-and-drop, sample payroll data shows the value each row produces, and the forms have a
// print preview. Save draft → Test run (wizard on the draft) → Publish.
import { useEffect, useMemo, useState } from 'react';
import { api, ApiError, errMsg, type User, type VersionInfo } from '../../api';
import { periodLabel } from '../../engine/effective';
import { scopeFor, type FormulaSite } from '../../engine/scopes';
import type { FormOut } from '../../engine/run';
import { normKey } from '../../engine/util';
import { formPhase, type CheckDef, type CostItem, type EmployeeColumn, type ExtraSheetDef, type FlowConfig, type FooterBlock, type FormColumn, type FormDef, type FormPhase, type InputDef, type InputField, type MasterTable, type RunParamDef, type Scalar, type SignatureRole } from '../../engine/types';
import { contextFromMasters, validateConfig, type ConfigError } from '../../engine/validate';
import { Alert, DataTable, download, fmt, useAsync } from '../common';
import { Card, Icon, PageHeader, toast } from '../layout';
import { RunWizard } from '../RunWizard';
import { blankConfig } from './blank';
import { FormulaInput } from './FormulaInput';
import { FieldInput } from './fields';
import { GridEditor } from './GridEditor';
import { Overview } from './Overview';
import { SampleBar, SampleValue, sumBy, useSample } from './Sample';
import { FormPreview } from './FormPreview';
import { Versions } from './Versions';
import { EffectiveDialog, range } from './Effective';

export function FlowEditorPage({ flowId, user }: { flowId: string; user: User }) {
  const detail = useAsync(() => api.flow(flowId), [flowId]);
  const masters = useAsync(() => api.masters(), []);
  const [base, setBase] = useState<{ config: FlowConfig; from: string } | null>(null);
  const [loadErr, setLoadErr] = useState('');

  useEffect(() => {
    const d = detail.data;
    if (!d) return;
    (async () => {
      try {
        if (d.draft) return setBase({ config: d.draft.config, from: `bản nháp (${d.draft.by}, ${new Date(d.draft.at).toLocaleString('vi-VN')})` });
        // start from the version in force now (or the newest one still in effect)
        const latest = d.versions.find((v) => v.state === 'current') ?? d.versions.find((v) => v.state !== 'cancelled' && v.state !== 'superseded');
        if (latest) {
          const v = await api.version(flowId, latest.version);
          return setBase({ config: v.config, from: `phiên bản v${v.version} (${latest.state === 'current' ? 'hiện hành' : 'hiệu lực ' + range(latest)})` });
        }
        setBase({ config: blankConfig(flowId, d.flow.name), from: 'cấu hình trống' });
      } catch (e) {
        setLoadErr(errMsg(e));
      }
    })();
  }, [detail.data, flowId]);

  if (detail.error || masters.error || loadErr) return <Alert kind="error">{detail.error || masters.error || loadErr}</Alert>;
  if (!base || !masters.data || !detail.data) return <div className="loading">Đang tải…</div>;
  return (
    <Editor
      key={base.from}
      initial={base.config}
      from={base.from}
      flowId={flowId}
      masters={masters.data.tables}
      versions={detail.data.versions}
      hasDraft={!!detail.data.draft}
      user={user}
      reload={() => {
        setBase(null);
        detail.reload();
      }}
    />
  );
}

type Tab = (typeof STEPS)[number]['id'] | 'errors' | 'json' | 'versions' | 'test';

/** Setup steps, in the order an admin fills them in. */
const STEPS = [
  { id: 'overview', label: 'Tổng quan', hint: 'Sơ đồ flow, các bước thiết lập và ma trận cost item.' },
  { id: 'general', no: 1, label: 'Thông tin chung', hint: 'Tên flow, tên file Excel xuất ra, sổ ledger dùng chung.', prefix: ['id', 'name', 'fileName'], done: (c: FlowConfig) => !!c.name && !!c.fileName },
  { id: 'inputs', no: 2, label: 'File đầu vào', hint: 'File người chạy sẽ nạp (bảng lương…) và các cột cần đọc trong file.', prefix: 'inputs', done: (c: FlowConfig) => c.inputs.length > 0 },
  { id: 'params', no: 3, label: 'Tham số chạy', hint: 'Thông tin người chạy nhập thêm mỗi lần: người ký, ngày ký, đơn vị…', prefix: 'runParams', optional: true, done: (c: FlowConfig) => c.runParams.length > 0 },
  { id: 'employee', no: 4, label: 'Bảng nhân viên', hint: 'Mỗi nhân viên một dòng; mỗi cột là một công thức, như một cột Excel.', prefix: 'employeeTable', done: (c: FlowConfig) => c.employeeTable.columns.length > 0 },
  { id: 'cost', no: 5, label: 'Cost items', hint: 'Các khoản chi phí: lấy tiền từ cột nào, vào Form 02 (trích) hay Form 03 (chi).', prefix: 'costItems', done: (c: FlowConfig) => c.costItems.length > 0 },
  { id: 'agg', no: 6, label: 'Gộp theo đơn vị', hint: 'Cách gộp tiền theo đơn vị / cost center và câu diễn giải trên form.', prefix: 'aggregation', done: (c: FlowConfig) => !!c.aggregation.unitColumn && !!c.aggregation.costCenterTable },
  { id: 'form02', no: 7, label: 'Form 02', hint: 'Cột, tiêu đề, chữ ký của Form 02 — có bản xem trước như khi in.', prefix: 'forms.form02' },
  { id: 'form03', no: 8, label: 'Form 03', hint: 'Cột, tiêu đề, chữ ký của Form 03 — có bản xem trước như khi in.', prefix: 'forms.form03' },
  { id: 'checks', no: 9, label: 'Kiểm tra', hint: 'Điều kiện phải đúng trước khi cho xuất file, để chặn số liệu sai.', prefix: 'checks', optional: true, done: (c: FlowConfig) => c.checks.length > 0 },
  { id: 'extra', no: 10, label: 'Sheet thêm', hint: 'Sheet tóm tắt tuỳ ý thêm vào file xuất.', prefix: 'extraSheets', optional: true, done: (c: FlowConfig) => (c.extraSheets ?? []).length > 0 },
] as const;

const KIND_OPTS = { number: { value: 'number', label: 'Số' }, text: { value: 'text', label: 'Chữ' }, date: { value: 'date', label: 'Ngày' } };

function Editor({
  initial,
  from,
  flowId,
  masters,
  versions,
  hasDraft,
  user,
  reload,
}: {
  initial: FlowConfig;
  from: string;
  flowId: string;
  masters: MasterTable[];
  versions: VersionInfo[];
  hasDraft: boolean;
  user: User;
  reload: () => void;
}) {
  const [cfg, setCfg] = useState<FlowConfig>(() => normalize(structuredClone(initial)));
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [focus, setFocus] = useState<{ tab: Tab; index: number } | null>(null);
  const go = (t: string, index?: number) => {
    setTab(t as Tab);
    setFocus(index === undefined ? null : { tab: t as Tab, index });
    document.querySelector('.content')?.scrollTo(0, 0);
  };
  const focusOn = (t: Tab) => (focus?.tab === t ? focus.index : null);
  const setMsg = (m: { kind: 'ok' | 'error' | 'warning'; text: string; errors?: ConfigError[] } | null) => {
    if (!m) return;
    toast(m.kind, m.errors?.length ? `${m.text} (${m.errors.length} lỗi — xem mục Lỗi cấu hình)` : m.text);
    if (m.errors?.length) setTab('errors');
  };
  const [testNo, setTestNo] = useState(0);
  const vctx = useMemo(() => contextFromMasters(masters), [masters]);
  const errors = useMemo(() => validateConfig(cfg, vctx), [cfg, vctx]);
  const at = (site: FormulaSite) => scopeFor(cfg, vctx, site);
  const { sample, bar } = useSample(cfg, masters);
  const [sampleOpen, setSampleOpen] = useState(false);
  const allRead = sample.on && cfg.inputs.filter((i) => i.required).every((i) => sample.parsed[i.id]?.data);
  useEffect(() => {
    if (allRead) setSampleOpen(false);
  }, [allRead]);

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const set = (patch: Partial<FlowConfig>) => {
    setCfg((c) => ({ ...c, ...patch }));
    setDirty(true);
  };
  const setForm = (id: 'form02' | 'form03', patch: Partial<FormDef>) => set({ forms: { ...cfg.forms, [id]: { ...cfg.forms[id], ...patch } } });

  const saveDraft = async () => {
    setMsg(null);
    try {
      const r = await api.saveDraft(flowId, cfg);
      setDirty(false);
      setMsg(r.errors.length ? { kind: 'warning', text: `Đã lưu nháp. Còn ${r.errors.length} lỗi — chưa publish được.` } : { kind: 'ok', text: 'Đã lưu nháp. Không có lỗi cấu hình.' });
      return true;
    } catch (e) {
      setMsg({ kind: 'error', text: errMsg(e) });
      return false;
    }
  };
  const [publishing, setPublishing] = useState(false);
  const publish = () => {
    if (errors.length) return setMsg({ kind: 'error', text: 'Còn lỗi cấu hình, chưa thể publish.', errors });
    setPublishing(true);
  };
  const doPublish = async (effectiveFrom: string, note: string) => {
    if (dirty && !(await saveDraft())) return;
    try {
      const r = await api.publish(flowId, { effectiveFrom, note });
      setPublishing(false);
      setMsg({ kind: 'ok', text: `Đã publish phiên bản v${r.version}, hiệu lực từ ${periodLabel(effectiveFrom)}.` });
      reload();
    } catch (e) {
      setPublishing(false);
      setMsg({ kind: 'error', text: errMsg(e), errors: e instanceof ApiError ? e.errors : undefined });
    }
  };

  const empCols = cfg.employeeTable.columns.map((c) => c.id);
  const empOpts = cfg.employeeTable.columns.map((c) => ({ value: c.id, label: c.label ? `${c.id} — ${c.label}` : c.id }));
  const tableNames = masters.map((t) => t.name);
  const ccCols = masters.find((t) => t.name === cfg.aggregation.costCenterTable)?.columns ?? [];
  const runParamIds = cfg.runParams.map((p) => p.id);
  const errCount = (prefix: string | readonly string[]) => errors.filter((e) => (typeof prefix === 'string' ? [prefix] : prefix).some((p) => e.path.startsWith(p))).length;

  // ---- sample values ------------------------------------------------------
  const r = sample.result;
  const emp = sample.emp;
  const empSample = (id: string, type: string) =>
    r ? <SampleValue value={emp?.values[id]} total={type === 'number' ? sumBy(r.employees, (e) => e.values[id]) : undefined} /> : null;
  const inputRow = (def: InputDef) => {
    const p = sample.parsed[def.id]?.data;
    if (!p || !emp) return null;
    const k = normKey(emp.key);
    return p.rows.find((x) => normKey(x[def.key]) === k) ?? null;
  };

  const idx = STEPS.findIndex((s) => s.id === tab);
  const step = idx >= 0 ? STEPS[idx] : null;
  const intro = step && 'no' in step && (
    <div className="step-intro">
      <span className="step-no big">{step.no}</span>
      <div className="step-text">
        <h2>{step.label}</h2>
        <p>{step.hint}</p>
      </div>
      <span className="spacer" />
      <button type="button" disabled={idx <= 1} onClick={() => go(STEPS[idx - 1].id)}>
        ← Bước trước
      </button>
      <button type="button" disabled={idx >= STEPS.length - 1} onClick={() => go(STEPS[idx + 1].id)}>
        Bước tiếp →
      </button>
    </div>
  );
  const tools: { id: Tab; label: string; count?: number }[] = [
    { id: 'errors', label: 'Lỗi cấu hình', count: errors.length },
    { id: 'test', label: 'Chạy thử' },
    { id: 'versions', label: 'Phiên bản' },
    { id: 'json', label: 'JSON (nâng cao)' },
  ];
  const navTab = (id: Tab, label: string, count?: number, no?: number, done?: boolean) => (
    <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'tab active' : 'tab'} onClick={() => go(id)}>
      {no !== undefined && (
        <span className={done ? 'step-no done' : 'step-no'} aria-hidden="true">
          {no}
        </span>
      )}
      <span className="tab-label">{label}</span>
      {count !== undefined && (
        <span className={`tab-count${count > 0 ? ' tab-count-error' : ' zero'}`} aria-hidden={count === 0}>
          {count}
        </span>
      )}
    </button>
  );

  return (
    <>
      <PageHeader
        icon="flow"
        crumb={<a href="#/admin/flows">Flows</a>}
        title={cfg.name || flowId}
        subtitle={
          <span className="editor-status">
            <span className="pill">{flowId}</span>
            <span>Đang sửa từ: {from}</span>
            <span className={dirty ? 'pill pill-warn' : 'pill pill-ghost'}>{dirty ? 'chưa lưu' : 'đã lưu'}</span>
            <span className={errors.length ? 'pill pill-bad' : 'pill pill-ok'}>{errors.length ? `${errors.length} lỗi` : 'hợp lệ'}</span>
          </span>
        }
        actions={
          <>
            <button type="button" onClick={() => download(JSON.stringify(cfg, null, 2), `${flowId}.config.json`, 'application/json')}>
              <Icon name="download" size={16} /> Xuất JSON
            </button>
            <button
              type="button"
              className="danger"
              disabled={!hasDraft}
              onClick={async () => {
                if (!confirm('Huỷ bản nháp và quay về phiên bản đang dùng?')) return;
                await api.deleteDraft(flowId);
                reload();
              }}
            >
              Huỷ nháp
            </button>
            <button type="button" onClick={saveDraft} disabled={!dirty}>
              <Icon name="save" size={16} /> Lưu nháp
            </button>
            <button type="button" className="primary" onClick={publish} disabled={errors.length > 0}>
              <Icon name="rocket" size={16} /> Publish
            </button>
          </>
        }
      />
      {publishing && (
        <EffectiveDialog
          title={dirty ? 'Lưu nháp và publish phiên bản mới' : 'Publish phiên bản mới'}
          what={`flow ${flowId}`}
          versions={versions}
          saveLabel="Publish"
          onClose={() => setPublishing(false)}
          onSave={doPublish}
        />
      )}
      <div className="editor-layout">
        <div className="editor-nav">
          <div className="tabs vertical" role="tablist" aria-orientation="vertical">
            <div className="nav-group">Thiết lập</div>
            {STEPS.map((s) => navTab(s.id, s.label, 'prefix' in s ? errCount(s.prefix) : undefined, 'no' in s ? s.no : undefined, 'no' in s && !('prefix' in s && errCount(s.prefix)) && ('done' in s ? s.done(cfg) : true)))}
            <div className="nav-group">Công cụ</div>
            {tools.map((t) => navTab(t.id, t.label, t.count))}
          </div>
        </div>
        <div className="tab-panel">
          {step && <SampleBar cfg={cfg} sample={sample} open={sampleOpen} setOpen={setSampleOpen} {...bar} />}
          {intro}

          {tab === 'overview' && <Overview cfg={cfg} errors={errors} steps={[...STEPS]} sample={sample} go={go} setCostItems={(costItems) => set({ costItems })} />}

          {tab === 'errors' && (
            <Card title="Lỗi cấu hình">
              {errors.length ? <ErrorList errors={errors} go={go} /> : <Alert kind="ok">Không có lỗi — có thể publish.</Alert>}
            </Card>
          )}

          {tab === 'general' && (
            <div className="card form-grid">
              <label>
                Tên flow
                <input value={cfg.name} onChange={(e) => set({ name: e.target.value })} />
                <small className="muted">Tên người chạy thấy ở trang chủ.</small>
              </label>
              <label>
                Tên file xuất
                <input value={cfg.fileName} onChange={(e) => set({ fileName: e.target.value })} />
                <small className="muted">
                  Dùng {'{MM}'} = tháng, {'{YYYY}'} = năm, {'{FLOW}'} = mã flow. Ví dụ: Form_{'{FLOW}'}_{'{MM}'}.{'{YYYY}'}.xlsx
                </small>
              </label>
              <label>
                Sổ ledger
                <input value={cfg.ledger ?? 'shared'} onChange={(e) => set({ ledger: e.target.value })} />
                <small className="muted">Các flow cùng tên sổ ghi chung một file ledger (theo dõi trích – chi).</small>
              </label>
            </div>
          )}

          {tab === 'inputs' && (
            <GridEditor<InputDef>
              items={cfg.inputs}
              onChange={(inputs) => set({ inputs })}
              path="inputs"
              errors={errors}
              focus={focusOn('inputs')}
              defaultOpen={cfg.inputs.length <= 2}
              addLabel="Thêm file đầu vào"
              empty="Chưa có file đầu vào. Thêm ít nhất một file (ví dụ bảng lương)."
              title={(x) => x.label || x.id}
              make={() => ({ id: `Input${cfg.inputs.length + 1}`, label: '', required: true, key: 'emp_id', fields: [{ id: 'emp_id', label: 'Mã NV', type: 'text', required: true, aliases: ['Mã NV'] }] })}
              fields={[
                { key: 'id', label: 'Mã file', short: 'Mã', kind: 'text', w: 160, help: 'Tên dùng trong công thức: in.<mã>.<cột>. Không dấu, không khoảng trắng.' },
                { key: 'label', label: 'Tên hiển thị cho người chạy', short: 'Tên hiển thị', kind: 'text' },
                { key: 'required', label: 'Bắt buộc phải nạp', short: 'Bắt buộc', kind: 'bool', w: 80 },
                { key: 'sheet', label: 'Sheet ưu tiên (để trống = tự tìm sheet có tiêu đề khớp nhất)', kind: 'text', detail: true },
              ]}
              sample={sample.on ? (inp) => {
                const p = sample.parsed[inp.id];
                return p?.data ? <span className="sv">{p.data.rows.length} dòng · sheet {p.data.sheet}</span> : <span className="sv sv-none">{p?.error ? 'lỗi đọc file' : 'chưa nạp'}</span>;
              } : undefined}
              sampleLabel="File mẫu"
              extra={(inp, i, update) => {
                const p = sample.parsed[inp.id]?.data;
                const row = inputRow(inp);
                return (
                  <div>
                    <div className="ge-sub-head">
                      <h4>Các cột cần đọc trong file "{inp.label || inp.id}"</h4>
                      <label className="inline-field">
                        Cột chứa mã nhân viên
                        <FieldInput f={{ key: 'key', label: '', kind: 'select', options: inp.fields.map((f) => ({ value: f.id, label: f.label || f.id })) }} value={inp.key} item={{}} index={0} onChange={(v) => update({ key: String(v) })} />
                      </label>
                    </div>
                    <p className="muted small">"Tên cột trong file": các tiêu đề có thể gặp, cách nhau bởi dấu |. Không phân biệt hoa / thường, khoảng trắng, xuống dòng.</p>
                    <GridEditor<InputField>
                      items={inp.fields}
                      onChange={(fields) => update({ fields })}
                      path={`inputs[${i}].fields`}
                      errors={errors}
                      addLabel="Thêm cột"
                      make={() => ({ id: `field${inp.fields.length + 1}`, type: 'number', aliases: [] })}
                      title={(f) => f.label || f.id}
                      fields={[
                        { key: 'id', label: 'Mã cột', short: 'Mã', kind: 'text', w: 110, help: `Dùng trong công thức: in.${inp.id}.<mã>` },
                        { key: 'type', label: 'Kiểu dữ liệu', short: 'Kiểu', kind: 'select', options: [KIND_OPTS.number, KIND_OPTS.text, KIND_OPTS.date], w: 76 },
                        { key: 'required', label: 'Bắt buộc có cột này', short: 'Bắt buộc', kind: 'bool', w: 64 },
                        { key: 'aliases', label: 'Tên cột trong file (alias)', short: 'Tên cột trong file', kind: 'aliases', help: 'Các tiêu đề cột có thể gặp trong file, cách nhau bởi |' },
                        { key: 'label', label: 'Tên gọi (hiện cho người chạy khi chọn cột bằng tay)', kind: 'text', detail: true },
                      ]}
                      sampleWidth={140}
                      sample={
                        p
                          ? (f) => {
                              const col = p.mapping[f.id];
                              if (col === undefined) return <span className={f.required ? 'sv sv-bad' : 'sv sv-none'}>không thấy cột</span>;
                              return (
                                <span className="sv">
                                  <span className="sv-main">{row ? fmt(row[f.id] ?? null) || '—' : '—'}</span>
                                  <span className="sv-total" title="Tiêu đề khớp trong file">
                                    ↔ {String(p.headers[col] ?? '').replace(/\s+/g, ' ')}
                                  </span>
                                </span>
                              );
                            }
                          : undefined
                      }
                      sampleLabel={emp ? `Mẫu (${emp.key})` : 'Mẫu'}
                    />
                    <h4>Cột tính thêm trên từng dòng (tuỳ chọn)</h4>
                    <p className="muted small">Tính cho mỗi dòng của file này, ví dụ phân loại dòng lương để dùng SUMIFS. in.{inp.id}.&lt;cột&gt; là dòng hiện tại.</p>
                    <GridEditor<NonNullable<InputDef['computed']>[number]>
                      items={inp.computed ?? []}
                      onChange={(computed) => update({ computed })}
                      make={() => ({ id: `calc${(inp.computed ?? []).length + 1}`, formula: '', type: 'text' })}
                      title={(c) => c.id}
                      path={`inputs[${i}].computed`}
                      errors={errors}
                      addLabel="Thêm cột tính"
                      empty="Không có cột tính thêm."
                      fields={[
                        { key: 'id', label: 'Mã', kind: 'text', w: 130 },
                        { key: 'label', label: 'Tên', kind: 'text', w: 150 },
                        { key: 'type', label: 'Kiểu', kind: 'select', options: [KIND_OPTS.number, KIND_OPTS.text], w: 90 },
                        { key: 'formula', label: 'Công thức', kind: 'formula', info: () => at({ kind: 'inputComputed' }) },
                      ]}
                    />
                  </div>
                );
              }}
            />
          )}

          {tab === 'params' && (
            <div>
              <p className="muted small">Tháng và năm luôn có sẵn (run.month, run.year). Thêm ở đây những gì người chạy cần nhập mỗi lần: người lập, người ký, ngày ký, hoặc chọn một dòng của bảng master.</p>
              <GridEditor<RunParamDef>
                items={cfg.runParams}
                onChange={(runParams) => set({ runParams })}
                path="runParams"
                errors={errors}
                focus={focusOn('params')}
                addLabel="Thêm tham số"
                empty="Không có tham số — người chạy chỉ chọn tháng / năm."
                title={(p) => `run.${p.id}`}
                make={() => ({ id: `param${cfg.runParams.length + 1}`, label: '', type: 'text' })}
                fields={[
                  { key: 'id', label: 'Mã', kind: 'text', w: 140, help: 'Dùng trong công thức: run.<mã>; trong tiêu đề: {<mã>}' },
                  { key: 'label', label: 'Nhãn người chạy thấy', short: 'Nhãn', kind: 'text' },
                  {
                    key: 'type',
                    label: 'Kiểu',
                    kind: 'select',
                    w: 150,
                    options: [KIND_OPTS.text, KIND_OPTS.number, KIND_OPTS.date, { value: 'master', label: 'Chọn từ bảng master' }, { value: 'costItem', label: 'Chọn cost item' }],
                  },
                  { key: 'table', label: 'Bảng master (khi kiểu = chọn từ bảng)', short: 'Bảng master', kind: 'select', options: tableNames, nullable: true, w: 150 },
                  { key: 'default', label: 'Giá trị mặc định', short: 'Mặc định', kind: 'text', w: 140 },
                  { key: 'required', label: 'Bắt buộc nhập', short: 'Bắt buộc', kind: 'bool', w: 76 },
                ]}
                sample={r ? (p) => <SampleValue value={r.run[p.id] ?? null} /> : undefined}
                sampleLabel="Giá trị mẫu"
              />
            </div>
          )}

          {tab === 'employee' && (
            <div>
              <div className="card form-grid">
                <label>
                  Lấy danh sách nhân viên từ file
                  <FieldInput
                    f={{ key: 'source', label: '', kind: 'select', options: cfg.inputs.map((i) => ({ value: i.id, label: i.label || i.id })) }}
                    value={cfg.employeeTable.source}
                    item={{}}
                    index={0}
                    onChange={(v) => set({ employeeTable: { ...cfg.employeeTable, source: String(v) } })}
                  />
                  <small className="muted">Mỗi mã nhân viên trong file này thành một dòng.</small>
                </label>
                <label className="wide">
                  Bỏ bớt nhân viên (tuỳ chọn — công thức trả FALSE thì bỏ)
                  <FormulaInput optional value={cfg.employeeTable.rowFilter} info={at({ kind: 'employeeFilter' })} onChange={(v) => set({ employeeTable: { ...cfg.employeeTable, rowFilter: v || null } })} />
                </label>
              </div>
              <p className="muted small">
                Mỗi dòng dưới đây là một cột của bảng nhân viên, tính từ trên xuống (chỉ dùng được cột phía trên). Kéo ⠿ để đổi thứ tự. Hay dùng: SUMOF(in.File.cột) = tổng của nhân viên trong file; LOOKUP("Bảng", khoá, "Cột", mặc định) = tra bảng master; P.khoá = tham số trong bảng Params.
              </p>
              <GridEditor<EmployeeColumn>
                items={cfg.employeeTable.columns}
                onChange={(columns) => set({ employeeTable: { ...cfg.employeeTable, columns } })}
                path="employeeTable.columns"
                errors={errors}
                focus={focusOn('employee')}
                addLabel="Thêm cột"
                title={(c) => `[${c.id}] ${c.label}`}
                make={() => ({ id: `col${cfg.employeeTable.columns.length + 1}`, label: '', formula: '', type: 'number' })}
                fields={[
                  { key: 'id', label: 'Mã cột', short: 'Mã', kind: 'text', w: 110, help: 'Dùng trong công thức: [mã] ở cột phía dưới, emp.mã ở form' },
                  { key: 'label', label: 'Tên cột', short: 'Tên', kind: 'text', w: 140 },
                  { key: 'type', label: 'Kiểu', kind: 'select', options: [KIND_OPTS.number, KIND_OPTS.text], w: 76 },
                  { key: 'formula', label: 'Công thức', kind: 'formula', info: (_x, i) => at({ kind: 'employeeColumn', index: i }) },
                  { key: 'show', label: 'Hiện ở màn hình xem trước của người chạy', kind: 'bool', default: true, detail: true },
                ]}
                sample={r ? (c) => empSample(c.id, c.type) : undefined}
                sampleLabel={emp ? `Giá trị của ${emp.key} · Σ tổng mọi nhân viên` : 'Mẫu'}
                sampleIn="formula"
              />
            </div>
          )}

          {tab === 'cost' && (
            <div>
              <p className="muted small">
                Mỗi dòng là một khoản chi phí. "Lấy tiền từ cột" = cột của bảng nhân viên chứa số tiền. Budget: tên một cột của bảng {cfg.aggregation.costCenterTable || 'đơn vị'} (tra theo đơn vị: {ccCols.join(', ') || '—'}) hoặc một mã cố định. Bấm ▸ để xem các tuỳ chọn thêm.
              </p>
              <GridEditor<CostItem>
                items={cfg.costItems}
                onChange={(costItems) => set({ costItems })}
                path="costItems"
                errors={errors}
                focus={focusOn('cost')}
                addLabel="Thêm cost item"
                title={(c) => c.helper || c.nameVi}
                make={() => ({ helper: '', costCode: '', nameVi: '', nameEn: '', periodType: 'M', budget: '', amount: empCols[0] ?? '', employeeAmount: null, accrue: true, pay: true })}
                fields={[
                  { key: 'helper', label: 'Helper (mã khoản)', short: 'Helper', kind: 'text', w: 100 },
                  { key: 'costCode', label: 'Cost Code', short: 'Cost code', kind: 'text', w: 80 },
                  { key: 'nameVi', label: 'Tên khoản (tiếng Việt)', short: 'Tên khoản', kind: 'text' },
                  { key: 'amount', label: 'Lấy tiền từ cột (bảng nhân viên)', short: 'Lấy tiền từ cột', kind: 'select', options: empOpts, w: 140, help: 'Để trống = khoản chỉ dùng để tra cứu (danh mục)' },
                  { key: 'periodType', label: 'Kỳ', kind: 'select', w: 84, options: [{ value: 'M', label: 'Tháng' }, { value: 'Q', label: 'Quý' }, { value: 'H', label: 'Nửa năm' }, { value: 'Y', label: 'Năm' }] },
                  { key: 'budget', label: 'Budget', kind: 'text', w: 84, placeholder: ccCols.slice(4, 6).join(' / ') },
                  { key: 'accrue', label: 'Vào Form 02 (trích)', short: 'F02', kind: 'bool', w: 44 },
                  { key: 'pay', label: 'Vào Form 03 (chi)', short: 'F03', kind: 'bool', w: 44 },
                  { key: 'nameEn', label: 'Tên khoản (tiếng Anh)', kind: 'text', detail: true },
                  { key: 'employeeAmount', label: 'Cột phần người lao động đóng (tuỳ chọn)', kind: 'select', options: empOpts, nullable: true, detail: true },
                  { key: 'helperColumn', label: 'Cột đổi Helper theo từng nhân viên (tuỳ chọn)', kind: 'select', options: empOpts, nullable: true, detail: true },
                  { key: 'costCenterColumn', label: 'Cột đổi Cost Center theo từng nhân viên (tuỳ chọn)', kind: 'select', options: empOpts, nullable: true, detail: true },
                  { key: 'unitFilter', label: 'Chỉ áp dụng cho đơn vị (tuỳ chọn, ví dụ CC("Key") = "SB")', kind: 'formula', optional: true, info: () => at({ kind: 'unitFilter' }), detail: true },
                ]}
                sample={
                  r
                    ? (c) => {
                        const rows = r.aggRows.filter((a) => a.helper === c.helper);
                        return (
                          <span className="sv">
                            <span className="sv-main num">{emp && c.amount ? fmt(emp.values[c.amount] ?? null) || '—' : '—'}</span>
                            <span className="sv-total">
                              Σ {fmt(sumBy(rows, (a) => a.amount) ?? 0)} · {rows.length} dòng
                            </span>
                          </span>
                        );
                      }
                    : undefined
                }
                sampleLabel={emp ? `Số tiền của ${emp.key} · Σ tổng các đơn vị` : 'Mẫu'}
                sampleIn="nameVi"
              />
            </div>
          )}

          {tab === 'agg' && (
            <div>
              <div className="card form-grid">
                {(
                  [
                    ['unitColumn', 'Cột đơn vị (của bảng nhân viên)', empCols],
                    ['costCenterTable', 'Bảng đơn vị (master)', tableNames],
                    ['deptColumn', 'Cột Dept (của bảng đơn vị)', ccCols],
                    ['costCenterColumn', 'Cột Cost Center (của bảng đơn vị)', ccCols],
                    ['sectorColumn', 'Cột Sector (của bảng đơn vị)', ccCols],
                  ] as const
                ).map(([k, label, opts]) => (
                  <label key={k}>
                    {label}
                    <FieldInput
                      f={{ key: k, label: '', kind: 'select', options: [...opts] }}
                      value={cfg.aggregation[k]}
                      item={{}}
                      index={0}
                      onChange={(v) => set({ aggregation: { ...cfg.aggregation, [k]: String(v) } })}
                    />
                  </label>
                ))}
                <label className="wide">
                  Câu diễn giải trên form
                  <input value={cfg.aggregation.descriptionTemplate} onChange={(e) => set({ aggregation: { ...cfg.aggregation, descriptionTemplate: e.target.value } })} />
                  <small className="muted">Ghép từ: {'{prefix} {name} {nameEn} {period} {dept} {unit} {costCenter} {costCode} {helper} {budgetCode} {sector}'}. Ví dụ: {'{prefix} {name}_{period}_{dept}-{unit}'}</small>
                </label>
                <label className="wide">
                  Chỉ lấy một số đơn vị (tuỳ chọn; row.unit, row.dept, row.costCenter, row.sector, CC("cột"))
                  <FormulaInput optional value={cfg.aggregation.unitFilter} info={at({ kind: 'unitFilter' })} onChange={(v) => set({ aggregation: { ...cfg.aggregation, unitFilter: v || null } })} />
                </label>
                <p className="muted small wide">Tiền được gộp theo Đơn vị × Budget Code × Cost Center × Helper, làm tròn đến đồng; sắp xếp theo Dept, Unit, Cost Center, Budget Code, Helper.</p>
              </div>
              {r && (
                <>
                  <h4>Kết quả gộp trên dữ liệu mẫu ({r.aggRows.length} dòng)</h4>
                  <DataTable
                    pageSize={20}
                    columns={[
                      { id: 'unit', label: 'Đơn vị' },
                      { id: 'costCenter', label: 'Cost center' },
                      { id: 'budgetCode', label: 'Budget' },
                      { id: 'helper', label: 'Helper' },
                      { id: 'description', label: 'Diễn giải' },
                      { id: 'count', label: 'Số NV', numeric: true },
                      { id: 'amount', label: 'Số tiền', numeric: true },
                    ]}
                    rows={r.aggRows as unknown as Record<string, Scalar>[]}
                  />
                </>
              )}
            </div>
          )}

          {(tab === 'form02' || tab === 'form03') && (
            <FormEditor
              key={tab}
              id={tab}
              form={cfg.forms[tab]}
              errors={errors}
              at={at}
              runParamIds={runParamIds}
              onChange={(p) => setForm(tab, p)}
              out={r?.[tab] ?? null}
              run={r?.run}
              focus={focusOn(tab)}
            />
          )}

          {tab === 'checks' && (
            <div>
              <p className="muted small">Mỗi dòng là một điều kiện phải ĐÚNG. Mức "Chặn" không cho xuất file khi sai; "Cảnh báo" chỉ nhắc. Phạm vi "Tổng": dùng SUM(emp.x), SUM(f02.x), SUM(f03.x), SUM(in.File.cột).</p>
              <GridEditor<CheckDef>
                items={cfg.checks}
                onChange={(checks) => set({ checks })}
                path="checks"
                errors={errors}
                focus={focusOn('checks')}
                addLabel="Thêm kiểm tra"
                empty="Chưa có kiểm tra nào."
                title={(c) => c.message || c.id}
                make={() => ({ id: `check${cfg.checks.length + 1}`, level: 'error', scope: 'employee', formula: '', message: '' })}
                fields={[
                  { key: 'id', label: 'Mã', kind: 'text', w: 110 },
                  { key: 'level', label: 'Mức', kind: 'select', w: 100, options: [{ value: 'error', label: 'Chặn' }, { value: 'warning', label: 'Cảnh báo' }] },
                  {
                    key: 'scope',
                    label: 'Kiểm tra trên',
                    kind: 'select',
                    w: 130,
                    options: [{ value: 'employee', label: 'Từng nhân viên' }, { value: 'form02', label: 'Từng dòng Form 02' }, { value: 'form03', label: 'Từng dòng Form 03' }, { value: 'total', label: 'Tổng' }],
                  },
                  { key: 'formula', label: 'Điều kiện đạt', kind: 'formula', info: (x) => at({ kind: 'check', scope: (x.scope as CheckDef['scope']) ?? 'employee' }) },
                  { key: 'message', label: 'Thông báo khi không đạt', short: 'Thông báo', kind: 'text' },
                ]}
                sample={
                  r
                    ? (c) => {
                        const fails = r.issues.filter((x) => x.source === c.id);
                        const n = fails.reduce((s, x) => s + x.count, 0);
                        return n ? (
                          <span className={c.level === 'error' ? 'sv sv-bad' : 'sv sv-warn'} title={fails.flatMap((x) => x.keys).slice(0, 20).join(', ')}>
                            ✕ {n} lần không đạt
                          </span>
                        ) : (
                          <span className="sv sv-ok">✓ đạt</span>
                        );
                      }
                    : undefined
                }
                sampleLabel="Kết quả trên dữ liệu mẫu"
                sampleIn="formula"
              />
            </div>
          )}

          {tab === 'extra' && (
            <GridEditor<ExtraSheetDef>
              items={cfg.extraSheets ?? []}
              onChange={(extraSheets) => set({ extraSheets })}
              path="extraSheets"
              errors={errors}
              focus={focusOn('extra')}
              addLabel="Thêm sheet"
              empty="Không có sheet thêm."
              title={(s) => s.name}
              make={() => ({ id: `sheet${(cfg.extraSheets ?? []).length + 1}`, name: 'Summary', title: '', columns: [{ header: 'Khoản', type: 'text' }, { header: 'Số tiền', type: 'number' }], rows: [] })}
              fields={[
                { key: 'id', label: 'Mã', kind: 'text', w: 120 },
                { key: 'name', label: 'Tên sheet', kind: 'text', w: 160 },
                { key: 'title', label: 'Tiêu đề', kind: 'text' },
              ]}
              extra={(s, i, update) => <ExtraSheetEditor sheet={s} update={update} info={at({ kind: 'extraCell' })} values={r?.extraSheets.find((x) => x.def.id === s.id)?.values ?? (r ? r.extraSheets[i]?.values : undefined)} />}
            />
          )}

          {tab === 'json' && <JsonTab cfg={cfg} onApply={(c) => (setCfg(normalize(c)), setDirty(true))} />}
          {tab === 'versions' && <Versions flowId={flowId} versions={versions} current={cfg} onRepublished={reload} />}
          {tab === 'test' && (
            <div>
              <p className="muted small">Chạy đầy đủ như người dùng (chọn đợt, nạp ledger, tải file) trên cấu hình đang sửa — file xuất có dòng "BẢN CHẠY THỬ".</p>
              {dirty && <Alert kind="warning">Có thay đổi chưa lưu — chạy thử dùng cấu hình đang sửa trên màn hình.</Alert>}
              <button type="button" onClick={() => setTestNo((n) => n + 1)}>
                Nạp lại cấu hình vào màn hình chạy thử
              </button>
              <RunWizard key={testNo} config={cfg} user={user} testMode embedded />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/** Errors grouped by setup step; each one opens the place to fix it. */
function ErrorList({ errors, go }: { errors: ConfigError[]; go: (tab: string, index?: number) => void }) {
  const stepOf = (path: string) => STEPS.find((s) => 'prefix' in s && (typeof s.prefix === 'string' ? [s.prefix] : s.prefix).some((p) => path.startsWith(p)));
  const groups = new Map<string, { label: string; no?: number; items: ConfigError[] }>();
  for (const e of errors.slice(0, 200)) {
    const s = stepOf(e.path);
    const k = s?.id ?? 'other';
    if (!groups.has(k)) groups.set(k, { label: s?.label ?? 'Khác', no: s && 'no' in s ? s.no : undefined, items: [] });
    groups.get(k)!.items.push(e);
  }
  return (
    <div className="error-groups">
      {[...groups.entries()].map(([k, g]) => (
        <div key={k} className="error-group">
          <h4>
            {g.no !== undefined && <span className="step-no">{g.no}</span>} {g.label}
          </h4>
          <ul className="small">
            {g.items.map((e, i) => {
              const m = /\[(\d+)\]/.exec(e.path);
              return (
                <li key={i}>
                  <button type="button" className="link" onClick={() => k !== 'other' && go(k, m ? Number(m[1]) : undefined)}>
                    {e.path}
                  </button>{' '}
                  {e.message}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function FormEditor({
  id,
  form,
  errors,
  at,
  runParamIds,
  onChange,
  out,
  run,
  focus,
}: {
  id: 'form02' | 'form03';
  form: FormDef;
  errors: ConfigError[];
  at: (s: FormulaSite) => ReturnType<typeof scopeFor>;
  runParamIds: string[];
  onChange: (p: Partial<FormDef>) => void;
  out: FormOut | null;
  run?: Record<string, Scalar>;
  focus: number | null;
}) {
  const L = form.layout;
  const setL = (p: Partial<FormDef['layout']>) => onChange({ layout: { ...L, ...p } });
  const numCols = form.columns.filter((c) => c.type === 'number').map((c) => c.id);
  const ferr = errors.filter((e) => e.path.startsWith(`forms.${id}.`) && !e.path.startsWith(`forms.${id}.columns`) && !e.path.startsWith(`forms.${id}.layout.signatures`));
  const [colFocus, setColFocus] = useState<number | null>(focus);
  useEffect(() => setColFocus(focus), [focus]);
  const [part, setPart] = useState<'columns' | 'layout'>('columns');
  const name = id === 'form02' ? 'Form 02' : 'Form 03';
  const paramOpts = runParamIds.map((p) => ({ value: p, label: `{${p}}` }));
  return (
    <div>
      <div className="card form-grid">
        <label className="check">
          <input type="checkbox" checked={form.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} /> Xuất {name}
        </label>
        <label>
          Xuất ở đợt
          <select value={formPhase(id, form)} onChange={(e) => onChange({ phase: e.target.value as FormPhase })}>
            <option value="accrual">Trích (chạy khi trích chi phí)</option>
            <option value="payment">Chi (chạy khi chi thực tế)</option>
          </select>
        </label>
        <label>
          Chữ đầu câu diễn giải
          <input value={form.prefix} onChange={(e) => onChange({ prefix: e.target.value })} />
        </label>
        <label className="check">
          <input type="checkbox" checked={form.adjust} onChange={(e) => onChange({ adjust: e.target.checked })} /> Điều chỉnh theo ledger (cộng / trừ chênh lệch kỳ trước)
        </label>
        <label>
          Ghi vào ledger
          <select value={form.ledgerFeed?.sheet ?? 'none'} onChange={(e) => onChange({ ledgerFeed: { ...form.ledgerFeed, sheet: e.target.value as FormDef['ledgerFeed']['sheet'] } })}>
            <option value="none">không ghi</option>
            <option value="accrual">sheet accrual (số trích)</option>
            <option value="actual">sheet actual (số chi thực tế)</option>
            <option value="both">cả hai, actual = accrual (chi đúng bằng số trích)</option>
          </select>
        </label>
        <label>
          Cột số tiền ghi vào ledger
          <FieldInput f={{ key: 'amountColumn', label: '', kind: 'select', options: numCols }} value={form.ledgerFeed?.amountColumn} item={{}} index={0} onChange={(v) => onChange({ ledgerFeed: { ...form.ledgerFeed, amountColumn: String(v) } })} />
        </label>
        <label className="wide">
          Chỉ lấy một số dòng (tuỳ chọn, theo row.*)
          <FormulaInput optional value={form.rowFilter} info={at({ kind: 'formRowFilter', form: id })} onChange={(v) => onChange({ rowFilter: v || null })} />
        </label>
        {ferr.length > 0 && (
          <div className="ferr wide">
            {ferr.map((e, i) => (
              <div key={i}>
                {e.path}: {e.message}
              </div>
            ))}
          </div>
        )}
      </div>

      <h3 className="section-title">Xem trước bản in</h3>
      <FormPreview def={form} out={out} run={run} onColumn={(i) => (setPart('columns'), setColFocus(null), setTimeout(() => setColFocus(i), 0))} />

      <div className="seg" role="group" aria-label="Phần cần sửa">
        <button type="button" className={part === 'columns' ? 'on' : undefined} aria-pressed={part === 'columns'} onClick={() => setPart('columns')}>
          Cột &amp; công thức
        </button>
        <button type="button" className={part === 'layout' ? 'on' : undefined} aria-pressed={part === 'layout'} onClick={() => setPart('layout')}>
          Tiêu đề &amp; chữ ký
        </button>
      </div>

      {part === 'columns' && (
        <>
          <p className="muted small">
            Mỗi dòng là một cột của form, từ trái sang phải; kéo ⠿ để đổi vị trí. row.* = dòng tổng hợp (unit, dept, costCenter, budgetCode, costCode, helper, name, period, description, amount, employeeAmount, count, adjusted…). UNITSUM(emp.x): tổng cột nhân viên của cả đơn vị, ví dụ{' '}
            <code>IF(row.costCode IN ("A","B"), UNITSUM(emp.si), 0)</code>.
          </p>
          <GridEditor<FormColumn>
            items={form.columns}
            onChange={(columns) => onChange({ columns })}
            path={`forms.${id}.columns`}
            errors={errors}
            focus={colFocus}
            addLabel="Thêm cột"
            title={(c) => `[${c.id}] ${c.headerVi}`}
            make={() => ({ id: `col${form.columns.length + 1}`, headerVi: '', headerEn: '', formula: '0', type: 'number' })}
            fields={[
              { key: 'id', label: 'Mã cột', short: 'Mã', kind: 'text', w: 100, help: `Dùng trong công thức: [mã]; ở kiểm tra: ${id === 'form02' ? 'f02' : 'f03'}.mã` },
              { key: 'headerVi', label: 'Tiêu đề tiếng Việt', short: 'Tiêu đề VI', kind: 'text', w: 140 },
              { key: 'headerEn', label: 'Tiêu đề tiếng Anh', short: 'Tiêu đề EN', kind: 'text', w: 120 },
              { key: 'type', label: 'Kiểu', kind: 'select', options: [KIND_OPTS.number, KIND_OPTS.text], w: 72 },
              { key: 'formula', label: 'Công thức', kind: 'formula', info: (_x, i) => at({ kind: 'formColumn', form: id, index: i }) },
              { key: 'hidden', label: 'Cột phụ (tính nhưng không in)', short: 'Ẩn', kind: 'bool', w: 44 },
              { key: 'total', label: 'Cộng ở dòng Tổng', kind: 'bool', default: true, detail: true },
              { key: 'hideIfZeroTotal', label: 'Ẩn cột nếu tổng = 0', kind: 'bool', detail: true },
              { key: 'width', label: 'Độ rộng cột trong Excel (để trống = tự động)', kind: 'number', detail: true },
            ]}
            sample={
              out
                ? (c) =>
                    c.type === 'number' ? (
                      <SampleValue value={out.rows[0]?.values[c.id] ?? null} total={out.totals[c.id] ?? sumBy(out.rows, (x) => x.values[c.id]) ?? 0} />
                    ) : (
                      <SampleValue value={out.rows[0]?.values[c.id] ?? null} />
                    )
                : undefined
            }
            sampleLabel="Trên dữ liệu mẫu: cột số = tổng, cột chữ = dòng đầu"
            sampleIn="formula"
          />
        </>
      )}

      {part === 'layout' && (
        <>
          <div className="card form-grid">
            <label>
              Tên sheet
              <input value={L.sheetName} onChange={(e) => setL({ sheetName: e.target.value })} />
            </label>
            <label>
              Tên công ty (dòng 1)
              <input value={L.companyName} onChange={(e) => setL({ companyName: e.target.value })} />
            </label>
            <label className="wide">
              Tiêu đề tiếng Việt
              <input value={L.titleVi} onChange={(e) => setL({ titleVi: e.target.value })} />
              <small className="muted">Dùng {'{MM}'} tháng, {'{YYYY}'} năm, {'{Q}'} quý, {'{H}'} nửa năm, {'{mã tham số}'}, hoặc {'{=công thức}'}.</small>
            </label>
            <label className="wide">
              Tiêu đề tiếng Anh
              <input value={L.titleEn} onChange={(e) => setL({ titleEn: e.target.value })} />
            </label>
            <label className="wide">
              Dòng trước tiêu đề (mỗi dòng một dòng, ví dụ "Đơn vị: {'{group}'}")
              <textarea rows={2} value={(L.preLines ?? []).join('\n')} onChange={(e) => setL({ preLines: e.target.value.split('\n') })} />
            </label>
            <label className="wide">
              Dòng dưới tiêu đề (mỗi dòng một dòng)
              <textarea rows={2} value={(L.extraLines ?? []).join('\n')} onChange={(e) => setL({ extraLines: e.target.value.split('\n') })} />
            </label>
            <label>
              Hướng giấy
              <select value={L.orientation ?? 'landscape'} onChange={(e) => setL({ orientation: e.target.value as 'portrait' | 'landscape' })}>
                <option value="landscape">Ngang</option>
                <option value="portrait">Dọc</option>
              </select>
            </label>
            <label>
              Vị trí dòng Tổng
              <select value={L.totalPosition ?? 'bottom'} onChange={(e) => setL({ totalPosition: e.target.value as 'top' | 'bottom' })}>
                <option value="bottom">Dưới bảng</option>
                <option value="top">Trên tiêu đề cột</option>
              </select>
            </label>
            <label>
              Chữ ở dòng Tổng
              <input value={L.totalLabel ?? ''} placeholder="Tổng cộng / Total" onChange={(e) => setL({ totalLabel: e.target.value })} />
            </label>
            <label className="wide">
              Dòng nơi / ngày ký (ví dụ "TP. Cần Thơ, ngày {'{sign_date}'}")
              <input value={L.placeDate ?? ''} onChange={(e) => setL({ placeDate: e.target.value })} />
            </label>
          </div>
          <h4 className="section-title">Chữ ký (từ trái sang phải)</h4>
          <GridEditor<SignatureRole>
            items={L.signatures ?? []}
            onChange={(signatures) => setL({ signatures })}
            path={`forms.${id}.layout.signatures`}
            errors={errors}
            addLabel="Thêm người ký"
            empty="Không có chữ ký."
            title={(s) => s.title}
            make={() => ({ title: '', titleEn: '' })}
            fields={[
              { key: 'title', label: 'Chức danh tiếng Việt', short: 'Chức danh VI', kind: 'text' },
              { key: 'titleEn', label: 'Chức danh tiếng Anh', short: 'Chức danh EN', kind: 'text' },
              { key: 'nameParam', label: 'Lấy tên từ tham số chạy', short: 'Tên từ tham số', kind: 'select', options: paramOpts, nullable: true, w: 160 },
              { key: 'name', label: 'Hoặc tên cố định', short: 'Tên cố định', kind: 'text', w: 160 },
            ]}
          />
          <h4 className="section-title">Phần dưới chữ ký (soát xét, chữ ký tầng 2…)</h4>
          <GridEditor<FooterBlock>
            items={L.footer ?? []}
            onChange={(footer) => setL({ footer })}
            addLabel="Thêm khối"
            empty="Không có."
            title={(b) => (b.kind === 'text' ? `Văn bản: ${(b.lines ?? [])[0] ?? ''}` : `Chữ ký: ${(b.roles ?? []).map((r) => r.title).join(' / ')}`)}
            make={() => ({ kind: 'text', lines: [] })}
            fields={[
              { key: 'kind', label: 'Loại', kind: 'select', w: 130, options: [{ value: 'text', label: 'Văn bản' }, { value: 'signatures', label: 'Hàng chữ ký' }] },
              { key: 'align', label: 'Căn (văn bản)', short: 'Căn', kind: 'select', w: 90, options: [{ value: 'left', label: 'Trái' }, { value: 'right', label: 'Phải' }], nullable: true },
              { key: 'lines', label: 'Các dòng chữ (văn bản)', short: 'Nội dung', kind: 'lines' },
            ]}
            extra={(b, _i, update) =>
              b.kind === 'signatures' ? (
                <GridEditor<SignatureRole>
                  items={b.roles ?? []}
                  onChange={(roles) => update({ roles } as Partial<FooterBlock>)}
                  addLabel="Thêm người ký"
                  title={(s) => s.title}
                  make={() => ({ title: '', titleEn: '' })}
                  fields={[
                    { key: 'title', label: 'Chức danh VI', kind: 'text' },
                    { key: 'titleEn', label: 'Chức danh EN', kind: 'text' },
                    { key: 'nameParam', label: 'Tên từ tham số', kind: 'select', options: paramOpts, nullable: true, w: 160 },
                    { key: 'name', label: 'Tên cố định', kind: 'text', w: 160 },
                  ]}
                />
              ) : (
                <p className="muted small">Chọn loại "Hàng chữ ký" để khai báo người ký.</p>
              )
            }
          />
        </>
      )}
    </div>
  );
}

function ExtraSheetEditor({ sheet, update, info, values }: { sheet: ExtraSheetDef; update: (p: Partial<ExtraSheetDef>) => void; info: ReturnType<typeof scopeFor>; values?: Scalar[][] }) {
  const cols = sheet.columns;
  return (
    <div>
      <h4>Cột</h4>
      <GridEditor
        items={cols}
        onChange={(columns) => update({ columns, rows: sheet.rows.map((r) => ({ cells: columns.map((_, i) => r.cells[i] ?? '') })) })}
        make={() => ({ header: '', type: 'number' as const })}
        addLabel="Thêm cột"
        title={(c) => c.header}
        fields={[
          { key: 'header', label: 'Tiêu đề', kind: 'text' },
          { key: 'type', label: 'Kiểu', kind: 'select', options: [KIND_OPTS.number, KIND_OPTS.text], w: 90 },
          { key: 'width', label: 'Độ rộng', kind: 'number', w: 90 },
        ]}
      />
      <h4>Dòng (mỗi ô là công thức phạm vi tổng; chữ cố định viết trong ngoặc kép)</h4>
      <table className="grid compact">
        <thead>
          <tr>
            {cols.map((c, i) => (
              <th key={i}>{c.header}</th>
            ))}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sheet.rows.map((r, ri) => (
            <tr key={ri}>
              {cols.map((_, ci) => (
                <td key={ci}>
                  <FormulaInput
                    optional
                    value={r.cells[ci] ?? ''}
                    info={info}
                    onChange={(v) => update({ rows: sheet.rows.map((x, j) => (j === ri ? { cells: cols.map((__, k) => (k === ci ? v : (x.cells[k] ?? ''))) } : x)) })}
                  />
                  {values && <div className="sv-cell">= {fmt(values[ri]?.[ci] ?? null) || '—'}</div>}
                </td>
              ))}
              <td>
                <button type="button" className="icon-btn danger-icon" aria-label="Xoá dòng" onClick={() => update({ rows: sheet.rows.filter((_, j) => j !== ri) })}>
                  <Icon name="trash" size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="ge-add" onClick={() => update({ rows: [...sheet.rows, { cells: cols.map(() => '') }] })}>
        <Icon name="plus" size={14} /> Thêm dòng
      </button>
    </div>
  );
}

function JsonTab({ cfg, onApply }: { cfg: FlowConfig; onApply: (c: FlowConfig) => void }) {
  const [text, setText] = useState(() => JSON.stringify(cfg, null, 2));
  const [err, setErr] = useState('');
  useEffect(() => setText(JSON.stringify(cfg, null, 2)), [cfg]);
  return (
    <div>
      <p className="muted small">Sửa trực tiếp JSON (nâng cao). Bấm "Áp dụng" để đưa vào trình sửa, rồi Lưu nháp.</p>
      <textarea className="json" spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} />
      {err && <Alert kind="error">{err}</Alert>}
      <button
        type="button"
        onClick={() => {
          try {
            const c = JSON.parse(text);
            if (c.schemaVersion !== 1) throw new Error('schemaVersion phải là 1');
            setErr('');
            onApply(c);
          } catch (e) {
            setErr(errMsg(e));
          }
        }}
      >
        Áp dụng
      </button>
    </div>
  );
}

/** Fill optional parts so the editor never meets undefined arrays. */
function normalize(c: FlowConfig): FlowConfig {
  const b = blankConfig(c.id, c.name);
  const form = (f: FormDef | undefined, d: FormDef): FormDef => ({
    ...d,
    ...f,
    ledgerFeed: { ...d.ledgerFeed, ...(f?.ledgerFeed ?? {}) },
    layout: { ...d.layout, ...(f?.layout ?? {}), signatures: f?.layout?.signatures ?? d.layout.signatures, extraLines: f?.layout?.extraLines ?? [] },
    columns: f?.columns ?? d.columns,
  });
  return {
    ...b,
    ...c,
    inputs: c.inputs ?? [],
    runParams: c.runParams ?? [],
    costItems: c.costItems ?? [],
    checks: c.checks ?? [],
    extraSheets: c.extraSheets ?? [],
    employeeTable: { ...b.employeeTable, ...c.employeeTable, columns: c.employeeTable?.columns ?? [] },
    aggregation: { ...b.aggregation, ...c.aggregation },
    forms: { form02: form(c.forms?.form02, b.forms.form02), form03: form(c.forms?.form03, b.forms.form03) },
  };
}
