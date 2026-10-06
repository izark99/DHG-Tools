// Thin client for /api. Request bodies are settings / metadata only — never payroll rows or amounts.
import type { ConfigError } from './engine/validate';
import type { FlowConfig, MasterTable } from './engine/types';

export interface User {
  username: string;
  display_name: string;
  role: 'admin' | 'user';
  must_change_password: boolean;
}

/** One version of a flow or a master table with its effective range (payroll periods YYYY-MM). */
export interface VersionInfo {
  version: number;
  effective_from: string;
  /** last period it applies to; null = open-ended (or superseded / cancelled) */
  effective_to: string | null;
  state: 'current' | 'past' | 'future' | 'superseded' | 'cancelled';
  note: string | null;
  by: string | null;
  at: string;
  cancelled_by: string | null;
  cancelled_at: string | null;
}

export interface FlowSummary {
  id: string;
  name: string;
  sort: number;
  active: boolean;
  /** version in force now (or the latest one if none applies yet) */
  published: (VersionInfo & { config: FlowConfig }) | null;
  versions: VersionInfo[];
  hasDraft?: boolean;
}

export interface FlowDetail {
  flow: { id: string; name: string; sort: number; active: boolean };
  versions: VersionInfo[];
  draft: { config: FlowConfig; by: string; at: string } | null;
}

/** A master table as it applies to a period. */
export type MasterAt = MasterTable & { version: number; effective_from: string; effective_to: string | null; note: string | null; by: string | null; at: string };

export interface MasterVersionData extends MasterTable {
  version: number;
  effective_from: string;
  note: string | null;
  by: string | null;
  at: string;
  cancelled: boolean;
}

export interface LedgerMark {
  ledger: string;
  last_period: string;
  file_hash: string;
  updated_by: string;
  updated_at: string;
}

export interface UserRow {
  username: string;
  display_name: string;
  role: 'admin' | 'user';
  must_change_password: number;
  active: number;
  failed_count: number;
  locked_until: string | null;
  created_at: string;
}

export interface RunLogRow {
  mode?: 'accrual' | 'payment' | 'both' | null;
  flow_id: string;
  flow_version: number | null;
  period: string;
  user: string;
  at: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public errors?: ConfigError[],
  ) {
    super(message);
  }
}

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => (onUnauthorized = fn);

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; errors?: ConfigError[] };
    if (res.status === 401 && path !== '/api/login') onUnauthorized();
    throw new ApiError(res.status, d.error ?? `Lỗi ${res.status}`, d.errors);
  }
  return data as T;
}

const enc = encodeURIComponent;

export const api = {
  me: () => call<{ user: User }>('GET', '/api/me'),
  login: (username: string, password: string) => call<{ user: User }>('POST', '/api/login', { username, password }),
  logout: () => call('POST', '/api/logout', {}),
  changePassword: (current: string, next: string) => call('POST', '/api/password', { current, next }),

  flows: () => call<{ flows: FlowSummary[] }>('GET', '/api/flows'),
  flow: (id: string) => call<FlowDetail>('GET', `/api/flows/${enc(id)}`),
  version: (id: string, v: number) =>
    call<{ version: number; by: string; at: string; effective_from: string; note: string | null; cancelled: boolean; config: FlowConfig }>('GET', `/api/flows/${enc(id)}/versions/${v}`),
  effectiveFlow: (id: string, period: string) =>
    call<{ flow: { id: string; name: string }; period: string; effective: (VersionInfo & { config: FlowConfig }) | null; versions: VersionInfo[] }>(
      'GET',
      `/api/flows/${enc(id)}/effective?period=${enc(period)}`,
    ),
  flowVersionAction: (id: string, v: number, action: 'cancel' | 'restore') => call<{ ok: true; versions: VersionInfo[] }>('POST', `/api/flows/${enc(id)}/versions/${v}`, { action }),
  createFlow: (id: string, name: string, config: FlowConfig) => call('POST', '/api/flows', { id, name, config }),
  patchFlow: (id: string, patch: { name?: string; sort?: number; active?: boolean }) => call('PATCH', `/api/flows/${enc(id)}`, patch),
  saveDraft: (id: string, config: FlowConfig) => call<{ ok: true; errors: ConfigError[] }>('PUT', `/api/flows/${enc(id)}/draft`, { config }),
  deleteDraft: (id: string) => call('DELETE', `/api/flows/${enc(id)}/draft`),
  publish: (id: string, o: { effectiveFrom: string; note?: string; fromVersion?: number }) =>
    call<{ ok: true; version: number; versions: VersionInfo[] }>('POST', `/api/flows/${enc(id)}/publish`, o),

  /** Tables that apply to a payroll period (default: now) + every table's version list. */
  masters: (period?: string) =>
    call<{ period: string; tables: MasterAt[]; catalog: { name: string; versions: VersionInfo[] }[] }>('GET', `/api/masters${period ? `?period=${enc(period)}` : ''}`),
  masterVersions: (name: string) => call<{ name: string; versions: VersionInfo[] }>('GET', `/api/masters/${enc(name)}`),
  masterVersion: (name: string, v: number) => call<MasterVersionData>('GET', `/api/masters/${enc(name)}/versions/${v}`),
  /** Never overwrites: adds a version effective from `effectiveFrom`. */
  putMaster: (t: MasterTable, effectiveFrom: string, note?: string) =>
    call<{ ok: true; version: number; versions: VersionInfo[] }>('PUT', `/api/masters/${enc(t.name)}`, { columns: t.columns, rows: t.rows, effectiveFrom, note }),
  masterVersionAction: (name: string, v: number, action: 'cancel' | 'restore') =>
    call<{ ok: true; versions: VersionInfo[] }>('POST', `/api/masters/${enc(name)}/versions/${v}`, { action }),
  deleteMaster: (name: string) => call('DELETE', `/api/masters/${enc(name)}`),

  users: () => call<{ users: UserRow[] }>('GET', '/api/users'),
  createUser: (u: { username: string; display_name: string; role: string; password: string }) => call('POST', '/api/users', u),
  patchUser: (username: string, patch: Record<string, unknown>) => call('PATCH', `/api/users/${enc(username)}`, patch),

  ledgerMark: (ledger: string) => call<{ mark: LedgerMark | null }>('GET', `/api/ledger-marks/${enc(ledger)}`),
  putLedgerMark: (ledger: string, last_period: string, file_hash: string) => call('PUT', `/api/ledger-marks/${enc(ledger)}`, { last_period, file_hash }),

  runs: () => call<{ latest: RunLogRow[] }>('GET', '/api/runs'),
  logRun: (flow_id: string, flow_version: number | null, period: string, master_versions: Record<string, number>, mode: 'accrual' | 'payment' | 'both') =>
    call('POST', '/api/runs', { flow_id, flow_version, period, master_versions, mode }),

  backup: () => call<unknown>('GET', '/api/backup'),
  importBackup: (data: unknown) => call<{ ok: true; masters: number; masterVersions: number; flows: number; texts: number }>('POST', '/api/backup', data),

  texts: () => call<{ texts: Record<string, string> }>('GET', '/api/ui-texts'),
  putText: (key: string, value: string) => call<{ ok: true; key: string; value: string }>('PUT', `/api/ui-texts/${enc(key)}`, { value }),
  deleteText: (key: string) => call('DELETE', `/api/ui-texts/${enc(key)}`),
};

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
