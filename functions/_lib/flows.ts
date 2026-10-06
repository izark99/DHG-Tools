import type { FlowConfig } from '../../src/engine/types';
import { contextFromMasters, validateConfig, type ConfigError } from '../../src/engine/validate';
import { HttpError } from './http';
import { allMasters } from './masters';

export const FLOW_ID = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
const MAX_CONFIG = 1_800_000;

export function cleanConfig(flowId: string, input: unknown): { config: FlowConfig; json: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'Config phải là một object JSON');
  const config = { ...(input as FlowConfig), id: flowId };
  const text = JSON.stringify(config);
  if (text.length > MAX_CONFIG) throw new HttpError(413, 'Config quá lớn');
  return { config, json: text };
}

export async function validateAgainstMasters(db: D1Database, config: FlowConfig): Promise<ConfigError[]> {
  const masters = await allMasters(db);
  try {
    return validateConfig(config, contextFromMasters(masters));
  } catch (e) {
    return [{ path: '', message: `Config không đọc được: ${e instanceof Error ? e.message : 'lỗi'}` }];
  }
}

export async function latestPublished(db: D1Database, flowId: string) {
  return db
    .prepare(`SELECT version, config_json, created_by, created_at FROM flow_versions
              WHERE flow_id = ? AND status = 'published' ORDER BY version DESC LIMIT 1`)
    .bind(flowId)
    .first<{ version: number; config_json: string; created_by: string; created_at: string }>();
}
