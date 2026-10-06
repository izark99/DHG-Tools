// Thin client for /api. Request bodies are settings / metadata only — never payroll rows or amounts.
import type { ConfigError } from './engine/validate';
import type { FlowConfig, MasterTable } from './engine/types';

export interface User {
  username: string;
  display_name: string;
  role: 'admin' | 'user';
  must_change_password: boolean;
}

export interface FlowSummary {
  id: string;
  name: string;
  sort: number;
  active: boolean;
  published: { version: number; by: string; at: string; config: FlowConfig } | null;
  hasDraft?: boolean;
}

export interface FlowDetail {
  flow: { id: string; name: string; sort: number; active: boolean };
  versions: { version: number; status: string; created_by: string; created_at: string }[];
  draft: { config: FlowConfig; by: string; at: string } | null;
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
  version: (id: string, v: number) => call<{ version: number; by: string; at: string; config: FlowConfig }>('GET', `/api/flows/${enc(id)}/versions/${v}`),
  createFlow: (id: string, name: string, config: FlowConfig) => call('POST', '/api/flows', { id, name, config }),
  patchFlow: (id: string, patch: { name?: string; sort?: number; active?: boolean }) => call('PATCH', `/api/flows/${enc(id)}`, patch),
  saveDraft: (id: string, config: FlowConfig) => call<{ ok: true; errors: ConfigError[] }>('PUT', `/api/flows/${enc(id)}/draft`, { config }),
  deleteDraft: (id: string) => call('DELETE', `/api/flows/${enc(id)}/draft`),
  publish: (id: string, fromVersion?: number) => call<{ ok: true; version: number }>('POST', `/api/flows/${enc(id)}/publish`, fromVersion === undefined ? {} : { fromVersion }),

  masters: () => call<{ tables: (MasterTable & { updated_by: string | null; updated_at: string | null })[] }>('GET', '/api/masters'),
  putMaster: (t: MasterTable) => call('PUT', `/api/masters/${enc(t.name)}`, { columns: t.columns, rows: t.rows }),
  deleteMaster: (name: string) => call('DELETE', `/api/masters/${enc(name)}`),

  users: () => call<{ users: UserRow[] }>('GET', '/api/users'),
  createUser: (u: { username: string; display_name: string; role: string; password: string }) => call('POST', '/api/users', u),
  patchUser: (username: string, patch: Record<string, unknown>) => call('PATCH', `/api/users/${enc(username)}`, patch),

  ledgerMark: (ledger: string) => call<{ mark: LedgerMark | null }>('GET', `/api/ledger-marks/${enc(ledger)}`),
  putLedgerMark: (ledger: string, last_period: string, file_hash: string) => call('PUT', `/api/ledger-marks/${enc(ledger)}`, { last_period, file_hash }),

  runs: () => call<{ latest: RunLogRow[] }>('GET', '/api/runs'),
  logRun: (flow_id: string, flow_version: number | null, period: string) => call('POST', '/api/runs', { flow_id, flow_version, period }),

  backup: () => call<unknown>('GET', '/api/backup'),
  importBackup: (data: unknown) => call<{ ok: true; masters: number; flows: number }>('POST', '/api/backup', data),
};

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
