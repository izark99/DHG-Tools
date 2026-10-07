// Interface texts: plain text only (rendered as text, never as HTML).
import { HttpError } from './http';

export const TEXT_KEY = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/;
export const TEXT_MAX = 4000;
/** Texts shown before login (login page, brand) — readable without a session. */
export const isPublicText = (key: string) => key.startsWith('login.') || key.startsWith('brand.');

export function cleanText(key: unknown, value: unknown): { key: string; value: string } {
  const k = String(key ?? '');
  if (!TEXT_KEY.test(k)) throw new HttpError(400, `Khoá văn bản không hợp lệ: ${k.slice(0, 40)}`);
  if (typeof value !== 'string') throw new HttpError(400, 'Nội dung phải là chuỗi');
  if (value.length > TEXT_MAX) throw new HttpError(400, `Nội dung tối đa ${TEXT_MAX} ký tự`);
  // keep line breaks and tabs, drop other control characters
  const v = value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
  return { key: k, value: v };
}

export const UPSERT_TEXT = `INSERT INTO ui_texts (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`;
