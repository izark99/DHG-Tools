// Flow editor: tabs per config section. Save draft → Test run (wizard on the draft) → Publish.
import { useEffect, useMemo, useState } from 'react';
import { api, ApiError, errMsg, type User } from '../../api';
import { scopeFor, type FormulaSite } from '../../engine/scopes';
import type { CheckDef, CostItem, EmployeeColumn, ExtraSheetDef, FlowConfig, FormColumn, FormDef, InputDef, InputField, MasterTable, RunParamDef, SignatureRole } from '../../engine/types';
import { contextFromMasters, validateConfig, type ConfigError } from '../../engine/validate';
import { Alert, download, Tabs, useAsync } from '../common';
import { Card, Icon, PageHeader, toast } from '../layout';
import { RunWizard } from '../RunWizard';
import { blankConfig } from './blank';
import { FormulaInput } from './FormulaInput';
import { FieldInput, ListEditor } from './ListEditor';
import { Versions } from './Versions';

type Tab = 'errors' | 'general' | 'inputs' | 'params' | 'employee' | 'cost' | 'agg' | 'form02' | 'form03' | 'checks' | 'extra' | 'json' | 'versions' | 'test';

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
        const latest = d.versions[0];
        if (latest) {
          const v = await api.version(flowId, latest.version);
          return setBase({ config: v.config, from: `phiên bản v${v.version} đang dùng` });
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
  versions: { version: number; created_by: string; created_at: string }[];
  hasDraft: boolean;
  user: User;
  reload: () => void;
}) {
  const [cfg, setCfg] = useState<FlowConfig>(() => normalize(structuredClone(initial)));
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<Tab>('general');
  const setMsg = (m: { kind: 'ok' | 'error' | 'warning'; text: string; errors?: ConfigError[] } | null) => {
    if (!m) return;
    toast(m.kind, m.errors?.length ? `${m.text} (${m.errors.length} lỗi — xem tab Lỗi cấu hình)` : m.text);
    if (m.errors?.length) setTab('errors');
  };
  const [testNo, setTestNo] = useState(0);
  const vctx = useMemo(() => contextFromMasters(masters), [masters]);
  const errors = useMemo(() => validateConfig(cfg, vctx), [cfg, vctx]);
  const at = (site: FormulaSite) => scopeFor(cfg, vctx, site);

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
  const publish = async () => {
    if (errors.length) return setMsg({ kind: 'error', text: 'Còn lỗi cấu hình, chưa thể publish.', errors });
    if (!confirm('Publish bản nháp thành phiên bản mới? Người dùng sẽ chạy theo phiên bản này ngay.')) return;
    if (dirty && !(await saveDraft())) return;
    try {
      const r = await api.publish(flowId);
      setMsg({ kind: 'ok', text: `Đã publish phiên bản v${r.version}.` });
      reload();
    } catch (e) {
      setMsg({ kind: 'error', text: errMsg(e), errors: e instanceof ApiError ? e.errors : undefined });
    }
  };

  const empCols = cfg.employeeTable.columns.map((c) => c.id);
  const tableNames = masters.map((t) => t.name);
  const ccCols = masters.find((t) => t.name === cfg.aggregation.costCenterTable)?.columns ?? [];
  const runParamIds = cfg.runParams.map((p) => p.id);
  const errCount = (prefix: string | string[]) => errors.filter((e) => (Array.isArray(prefix) ? prefix : [prefix]).some((p) => e.path.startsWith(p))).length;
  const t = (id: Tab, label: string, prefix?: string | string[]) => ({ id, label, count: prefix ? errCount(prefix) : undefined, tone: 'error' as const });

  const tabs = [
    t('general', 'Chung', ['id', 'name', 'fileName']),
    t('inputs', 'Inputs', 'inputs'),
    t('params', 'Tham số chạy', 'runParams'),
    t('employee', 'Bảng nhân viên', 'employeeTable'),
    t('cost', 'Cost items', 'costItems'),
    t('agg', 'Tổng hợp', 'aggregation'),
    t('form02', 'Form 02', 'forms.form02'),
    t('form03', 'Form 03', 'forms.form03'),
    t('checks', 'Kiểm tra', 'checks'),
    t('extra', 'Sheet thêm', 'extraSheets'),
    { id: 'errors' as Tab, label: 'Lỗi cấu hình', count: errors.length, tone: 'error' as const },
    { id: 'json' as Tab, label: 'JSON' },
    { id: 'versions' as Tab, label: 'Phiên bản' },
    { id: 'test' as Tab, label: 'Chạy thử' },
  ];

  return (
    <>
      <PageHeader
        crumb={
          <>
            <a href="#/admin/flows">Flows</a> <Icon name="chevron" size={12} /> {flowId}
          </>
        }
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
      <div className="editor-layout">
      <div className="editor-nav">
        <Tabs tabs={tabs} value={tab} onChange={setTab} vertical />
      </div>
      <div className="tab-panel">
      {tab === 'errors' && (
        <Card title="Lỗi cấu hình">
          {errors.length ? <ErrorList errors={errors} /> : <Alert kind="ok">Không có lỗi — có thể publish.</Alert>}
        </Card>
      )}

      {tab === 'general' && (
        <div className="card form-grid">
          <label>
            Tên flow
            <input value={cfg.name} onChange={(e) => set({ name: e.target.value })} />
          </label>
          <label>
            Mẫu tên file xuất ({'{MM}'} {'{YYYY}'} {'{FLOW}'} …)
            <input value={cfg.fileName} onChange={(e) => set({ fileName: e.target.value })} />
          </label>
          <label>
            Tên ledger (dùng chung cho các flow)
            <input value={cfg.ledger ?? 'shared'} onChange={(e) => set({ ledger: e.target.value })} />
          </label>
        </div>
      )}

      {tab === 'inputs' && (
        <ListEditor<InputDef>
          items={cfg.inputs}
          onChange={(inputs) => set({ inputs })}
          path="inputs"
          errors={errors}
          title={(x) => `${x.id} — ${x.label}`}
          make={() => ({ id: `Input${cfg.inputs.length + 1}`, label: '', required: true, key: 'emp_id', fields: [{ id: 'emp_id', label: 'Mã NV', type: 'text', required: true, aliases: ['Mã NV'] }] })}
          fields={[
            { key: 'id', label: 'Mã input', kind: 'text' },
            { key: 'label', label: 'Tên hiển thị', kind: 'text' },
            { key: 'required', label: 'Bắt buộc', kind: 'bool' },
            { key: 'sheet', label: 'Sheet ưu tiên (tuỳ chọn)', kind: 'text' },
          ]}
          extra={(inp, _i, update) => (
            <div>
              <label>
                Field khoá (mã nhân viên){' '}
                <FieldInput f={{ key: 'key', label: '', kind: 'select', options: inp.fields.map((f) => f.id) }} value={inp.key} item={{}} index={0} onChange={(v) => update({ key: String(v) })} />
              </label>
              <h4>Fields</h4>
              <p className="muted small">Alias: các tên tiêu đề có thể gặp trong file, cách nhau bởi "|". Không phân biệt hoa/thường, khoảng trắng, xuống dòng.</p>
              <ListEditor<InputField>
                items={inp.fields}
                onChange={(fields) => update({ fields })}
                make={() => ({ id: `field${inp.fields.length + 1}`, type: 'number', aliases: [] })}
                title={(f) => f.id}
                fields={[
                  { key: 'id', label: 'Mã field', kind: 'text' },
                  { key: 'label', label: 'Tên', kind: 'text' },
                  { key: 'type', label: 'Kiểu', kind: 'select', options: ['text', 'number', 'date'] },
                  { key: 'required', label: 'Bắt buộc', kind: 'bool' },
                  { key: 'aliases', label: 'Alias tiêu đề', kind: 'aliases', wide: true },
                ]}
              />
            </div>
          )}
        />
      )}

      {tab === 'params' && (
        <div>
          <p className="muted small">Tháng và năm luôn có sẵn (run.month, run.year). Thêm tham số người chạy nhập: dòng "Đơn vị", người ký, ngày ký, hoặc chọn từ bảng master.</p>
          <ListEditor<RunParamDef>
            items={cfg.runParams}
            onChange={(runParams) => set({ runParams })}
            path="runParams"
            errors={errors}
            title={(p) => `run.${p.id}`}
            make={() => ({ id: `param${cfg.runParams.length + 1}`, label: '', type: 'text' })}
            fields={[
              { key: 'id', label: 'Mã', kind: 'text' },
              { key: 'label', label: 'Nhãn', kind: 'text' },
              { key: 'type', label: 'Kiểu', kind: 'select', options: ['text', 'number', 'date', 'master'] },
              { key: 'table', label: 'Bảng master (kiểu master)', kind: 'select', options: tableNames, nullable: true },
              { key: 'default', label: 'Mặc định', kind: 'text' },
              { key: 'required', label: 'Bắt buộc', kind: 'bool' },
            ]}
          />
        </div>
      )}

      {tab === 'employee' && (
        <div>
          <div className="card form-grid">
            <label>
              Input nguồn (mỗi mã NV một dòng)
              <FieldInput
                f={{ key: 'source', label: '', kind: 'select', options: cfg.inputs.map((i) => i.id) }}
                value={cfg.employeeTable.source}
                item={{}}
                index={0}
                onChange={(v) => set({ employeeTable: { ...cfg.employeeTable, source: String(v) } })}
              />
            </label>
            <label className="wide">
              Bộ lọc dòng (tuỳ chọn, FALSE = bỏ nhân viên)
              <FormulaInput optional value={cfg.employeeTable.rowFilter} info={at({ kind: 'employeeFilter' })} onChange={(v) => set({ employeeTable: { ...cfg.employeeTable, rowFilter: v || null } })} />
            </label>
          </div>
          <p className="muted small">
            Mỗi cột là một công thức, tính theo thứ tự (chỉ dùng cột phía trên). FIRST(in.X.f) / SUMOF(in.X.f): giá trị của chính nhân viên trong input X. LOOKUP("Bảng", khoá, "Cột", mặc định). P.key: tham số trong bảng Params.
          </p>
          <ListEditor<EmployeeColumn>
            items={cfg.employeeTable.columns}
            onChange={(columns) => set({ employeeTable: { ...cfg.employeeTable, columns } })}
            path="employeeTable.columns"
            errors={errors}
            title={(c) => `[${c.id}] ${c.label}`}
            make={() => ({ id: `col${cfg.employeeTable.columns.length + 1}`, label: '', formula: '', type: 'number' })}
            fields={[
              { key: 'id', label: 'Mã cột', kind: 'text' },
              { key: 'label', label: 'Tên', kind: 'text' },
              { key: 'type', label: 'Kiểu', kind: 'select', options: ['number', 'text'] },
              { key: 'show', label: 'Hiện ở xem trước', kind: 'bool', default: true },
              { key: 'formula', label: 'Công thức', kind: 'formula', info: (_x, i) => at({ kind: 'employeeColumn', index: i }) },
            ]}
          />
        </div>
      )}

      {tab === 'cost' && (
        <div>
          <p className="muted small">Budget: tên một cột của bảng {cfg.aggregation.costCenterTable} (tra theo đơn vị: {ccCols.join(', ') || '—'}) hoặc một mã cố định.</p>
          <ListEditor<CostItem>
            items={cfg.costItems}
            onChange={(costItems) => set({ costItems })}
            path="costItems"
            errors={errors}
            title={(c) => `${c.helper} — ${c.nameVi}`}
            make={() => ({ helper: '', costCode: '', nameVi: '', nameEn: '', periodType: 'M', budget: '', amount: empCols[0] ?? '', employeeAmount: null, accrue: true, pay: true })}
            fields={[
              { key: 'helper', label: 'Helper', kind: 'text' },
              { key: 'costCode', label: 'Cost Code', kind: 'text' },
              { key: 'nameVi', label: 'Tên (VI)', kind: 'text' },
              { key: 'nameEn', label: 'Tên (EN)', kind: 'text' },
              { key: 'periodType', label: 'Kỳ', kind: 'select', options: [{ value: 'M', label: 'M - tháng' }, { value: 'Q', label: 'Q - quý' }, { value: 'H', label: 'H - nửa năm' }, { value: 'Y', label: 'Y - năm' }] },
              { key: 'budget', label: 'Budget', kind: 'text', placeholder: ccCols.slice(4).join(' / ') },
              { key: 'amount', label: 'Cột số tiền', kind: 'select', options: empCols },
              { key: 'employeeAmount', label: 'Cột phần NLĐ (tuỳ chọn)', kind: 'select', options: empCols, nullable: true },
              { key: 'helperColumn', label: 'Cột ghi đè Helper', kind: 'select', options: empCols, nullable: true },
              { key: 'costCenterColumn', label: 'Cột ghi đè Cost Center', kind: 'select', options: empCols, nullable: true },
              { key: 'accrue', label: 'Trích (Form 02)', kind: 'bool' },
              { key: 'pay', label: 'Chi (Form 03)', kind: 'bool' },
              { key: 'unitFilter', label: 'Áp dụng cho đơn vị (tuỳ chọn — thay cho cột Key; ví dụ CC("Key") = "SB")', kind: 'formula', optional: true, info: () => at({ kind: 'unitFilter' }) },
            ]}
          />
        </div>
      )}

      {tab === 'agg' && (
        <div className="card form-grid">
          {(
            [
              ['unitColumn', 'Cột đơn vị (bảng nhân viên)', empCols],
              ['costCenterTable', 'Bảng đơn vị (master)', tableNames],
              ['deptColumn', 'Cột Dept', ccCols],
              ['costCenterColumn', 'Cột Cost Center', ccCols],
              ['sectorColumn', 'Cột Sector', ccCols],
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
            Mẫu diễn giải — {'{prefix} {name} {nameEn} {period} {dept} {unit} {costCenter} {costCode} {helper} {budgetCode} {sector}'}
            <input value={cfg.aggregation.descriptionTemplate} onChange={(e) => set({ aggregation: { ...cfg.aggregation, descriptionTemplate: e.target.value } })} />
          </label>
          <label className="wide">
            Bộ lọc đơn vị (tuỳ chọn; row.unit, row.dept, row.costCenter, row.sector, CC("cột"))
            <FormulaInput optional value={cfg.aggregation.unitFilter} info={at({ kind: 'unitFilter' })} onChange={(v) => set({ aggregation: { ...cfg.aggregation, unitFilter: v || null } })} />
          </label>
          <p className="muted small wide">Gộp theo Đơn vị × Budget Code × Cost Center × Helper, cộng và làm tròn đến đồng. Sắp xếp: Dept, Unit, Cost Center, Budget Code, Helper.</p>
        </div>
      )}

      {(tab === 'form02' || tab === 'form03') && (
        <FormEditor id={tab} form={cfg.forms[tab]} errors={errors} at={at} runParamIds={runParamIds} onChange={(p) => setForm(tab, p)} />
      )}

      {tab === 'checks' && (
        <div>
          <p className="muted small">Công thức trả TRUE = đạt. Mức error chặn xuất file; warning chỉ cảnh báo. Phạm vi total: dùng SUM(emp.x), SUM(f02.x), SUM(f03.x), SUM(in.X.f).</p>
          <ListEditor<CheckDef>
            items={cfg.checks}
            onChange={(checks) => set({ checks })}
            path="checks"
            errors={errors}
            title={(c) => `${c.id} — ${c.message}`}
            make={() => ({ id: `check${cfg.checks.length + 1}`, level: 'error', scope: 'employee', formula: '', message: '' })}
            fields={[
              { key: 'id', label: 'Mã', kind: 'text' },
              { key: 'level', label: 'Mức', kind: 'select', options: ['error', 'warning'] },
              { key: 'scope', label: 'Phạm vi', kind: 'select', options: ['employee', 'form02', 'form03', 'total'] },
              { key: 'message', label: 'Thông báo khi không đạt', kind: 'text', wide: true },
              { key: 'formula', label: 'Điều kiện đạt', kind: 'formula', info: (x) => at({ kind: 'check', scope: (x.scope as CheckDef['scope']) ?? 'employee' }) },
            ]}
          />
        </div>
      )}

      {tab === 'extra' && (
        <ListEditor<ExtraSheetDef>
          items={cfg.extraSheets ?? []}
          onChange={(extraSheets) => set({ extraSheets })}
          path="extraSheets"
          errors={errors}
          title={(s) => s.name}
          make={() => ({ id: `sheet${(cfg.extraSheets ?? []).length + 1}`, name: 'Summary', title: '', columns: [{ header: 'Khoản' , type: 'text' }, { header: 'Số tiền', type: 'number' }], rows: [] })}
          fields={[
            { key: 'id', label: 'Mã', kind: 'text' },
            { key: 'name', label: 'Tên sheet', kind: 'text' },
            { key: 'title', label: 'Tiêu đề', kind: 'text', wide: true },
          ]}
          extra={(s, _i, update) => <ExtraSheetEditor sheet={s} update={update} info={at({ kind: 'extraCell' })} />}
        />
      )}

      {tab === 'json' && <JsonTab cfg={cfg} onApply={(c) => (setCfg(normalize(c)), setDirty(true))} />}
      {tab === 'versions' && <Versions flowId={flowId} versions={versions} current={cfg} onRepublished={reload} />}
      {tab === 'test' && (
        <div>
          {dirty && <Alert kind="warning">Có thay đổi chưa lưu — chạy thử dùng cấu hình đang sửa trên màn hình.</Alert>}
          <button type="button" onClick={() => setTestNo((n) => n + 1)}>
            Nạp lại cấu hình vào màn hình chạy thử
          </button>
          <RunWizard key={testNo} config={cfg} version={null} masters={masters} user={user} testMode embedded />
        </div>
      )}
      </div>
      </div>
    </>
  );
}

function ErrorList({ errors }: { errors: ConfigError[] }) {
  return (
    <ul className="small">
      {errors.slice(0, 100).map((e, i) => (
        <li key={i}>
          <code>{e.path}</code> {e.message}
        </li>
      ))}
    </ul>
  );
}

function FormEditor({
  id,
  form,
  errors,
  at,
  runParamIds,
  onChange,
}: {
  id: 'form02' | 'form03';
  form: FormDef;
  errors: ConfigError[];
  at: (s: FormulaSite) => ReturnType<typeof scopeFor>;
  runParamIds: string[];
  onChange: (p: Partial<FormDef>) => void;
}) {
  const L = form.layout;
  const setL = (p: Partial<FormDef['layout']>) => onChange({ layout: { ...L, ...p } });
  const numCols = form.columns.filter((c) => c.type === 'number').map((c) => c.id);
  const ferr = errors.filter((e) => e.path.startsWith(`forms.${id}.`) && !e.path.startsWith(`forms.${id}.columns`));
  return (
    <div>
      <div className="card form-grid">
        <label className="check">
          <input type="checkbox" checked={form.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} /> Xuất {id === 'form02' ? 'Form 02' : 'Form 03'}
        </label>
        <label>
          Tiền tố diễn giải
          <input value={form.prefix} onChange={(e) => onChange({ prefix: e.target.value })} />
        </label>
        <label className="check">
          <input type="checkbox" checked={form.adjust} onChange={(e) => onChange({ adjust: e.target.checked })} /> Điều chỉnh theo ledger (Adjusted amount last period)
        </label>
        <label>
          Ghi vào ledger
          <select value={form.ledgerFeed?.sheet ?? 'none'} onChange={(e) => onChange({ ledgerFeed: { ...form.ledgerFeed, sheet: e.target.value as FormDef['ledgerFeed']['sheet'] } })}>
            <option value="none">không ghi</option>
            <option value="accrual">sheet accrual (số trích)</option>
            <option value="actual">sheet actual (số chi thực tế)</option>
          </select>
        </label>
        <label>
          Cột số tiền ghi vào ledger
          <FieldInput
            f={{ key: 'amountColumn', label: '', kind: 'select', options: numCols }}
            value={form.ledgerFeed?.amountColumn}
            item={{}}
            index={0}
            onChange={(v) => onChange({ ledgerFeed: { ...form.ledgerFeed, amountColumn: String(v) } })}
          />
        </label>
        <label className="wide">
          Bộ lọc dòng (tuỳ chọn, theo row.*)
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

      <h3 className="section-title">Cột</h3>
      <p className="muted small">
        row.* = dòng tổng hợp (no, sector, dept, unit, budgetCode, costCenter, costCode, helper, name, period, description, amount, employeeAmount, count, adjusted, actualAccrual). UNITSUM(emp.x): tổng cột nhân viên của cả đơn vị, đặt vào dòng thoả điều kiện, ví dụ{' '}
        <code>IF(row.costCode IN ("A","B"), UNITSUM(emp.si), 0)</code>.
      </p>
      <ListEditor<FormColumn>
        items={form.columns}
        onChange={(columns) => onChange({ columns })}
        path={`forms.${id}.columns`}
        errors={errors}
        title={(c) => `[${c.id}] ${c.headerVi}`}
        make={() => ({ id: `col${form.columns.length + 1}`, headerVi: '', headerEn: '', formula: '0', type: 'number' })}
        fields={[
          { key: 'id', label: 'Mã cột', kind: 'text' },
          { key: 'headerVi', label: 'Tiêu đề VI', kind: 'text' },
          { key: 'headerEn', label: 'Tiêu đề EN', kind: 'text' },
          { key: 'type', label: 'Kiểu', kind: 'select', options: ['number', 'text'] },
          { key: 'width', label: 'Độ rộng', kind: 'number' },
          { key: 'total', label: 'Cộng ở dòng Total', kind: 'bool', default: true },
          { key: 'hideIfZeroTotal', label: 'Ẩn nếu tổng = 0', kind: 'bool' },
          { key: 'formula', label: 'Công thức', kind: 'formula', info: (_x, i) => at({ kind: 'formColumn', form: id, index: i }) },
        ]}
      />

      <h3 className="section-title">Layout in</h3>
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
          Tiêu đề VI ({'{MM} {YYYY} {Q} {H} {tham_số}'})
          <input value={L.titleVi} onChange={(e) => setL({ titleVi: e.target.value })} />
        </label>
        <label className="wide">
          Tiêu đề EN
          <input value={L.titleEn} onChange={(e) => setL({ titleEn: e.target.value })} />
        </label>
        <label className="wide">
          Dòng thêm dưới tiêu đề (mỗi dòng một dòng, ví dụ "Đơn vị: {'{group}'}")
          <textarea rows={2} value={(L.extraLines ?? []).join('\n')} onChange={(e) => setL({ extraLines: e.target.value.split('\n') })} />
        </label>
        <label className="wide">
          Dòng nơi/ngày ký (ví dụ "TP. Cần Thơ, ngày {'{sign_date}'}")
          <input value={L.placeDate ?? ''} onChange={(e) => setL({ placeDate: e.target.value })} />
        </label>
      </div>
      <h4 className="section-title">Chữ ký</h4>
      <ListEditor<SignatureRole>
        items={L.signatures ?? []}
        onChange={(signatures) => setL({ signatures })}
        path={`forms.${id}.layout.signatures`}
        errors={errors}
        title={(s) => s.title}
        make={() => ({ title: '', titleEn: '' })}
        fields={[
          { key: 'title', label: 'Chức danh VI', kind: 'text' },
          { key: 'titleEn', label: 'Chức danh EN', kind: 'text' },
          { key: 'nameParam', label: 'Tham số chứa tên người ký', kind: 'select', options: runParamIds, nullable: true },
        ]}
      />
    </div>
  );
}

function ExtraSheetEditor({ sheet, update, info }: { sheet: ExtraSheetDef; update: (p: Partial<ExtraSheetDef>) => void; info: ReturnType<typeof scopeFor> }) {
  const cols = sheet.columns;
  return (
    <div>
      <h4>Cột</h4>
      <ListEditor
        items={cols}
        onChange={(columns) => update({ columns, rows: sheet.rows.map((r) => ({ cells: columns.map((_, i) => r.cells[i] ?? '') })) })}
        make={() => ({ header: '', type: 'number' as const })}
        title={(c) => c.header}
        fields={[
          { key: 'header', label: 'Tiêu đề', kind: 'text' },
          { key: 'type', label: 'Kiểu', kind: 'select', options: ['number', 'text'] },
          { key: 'width', label: 'Độ rộng', kind: 'number' },
        ]}
      />
      <h4>Dòng (mỗi ô là công thức phạm vi total; chữ cố định viết trong ngoặc kép)</h4>
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
                </td>
              ))}
              <td>
                <button type="button" className="link small" onClick={() => update({ rows: sheet.rows.filter((_, j) => j !== ri) })}>
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" onClick={() => update({ rows: [...sheet.rows, { cells: cols.map(() => '') }] })}>
        + Dòng
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
