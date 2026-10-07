// Effective-dated versions (flows and master tables). A version applies from its payroll period
// (YYYY-MM) until the period before the next active version starts; the last one is "hiện hành"
// (open-ended). Saving a change always adds a version — old ones are kept and keep applying to
// their own periods, so re-running an old period gives the old result.
// Two active versions with the same start: the higher version number wins (the other is "superseded").
// A cancelled version is kept for the record but never applies.

export const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
/** Start of versions that existed before effective dates were introduced ("từ đầu"). */
export const BEGINNING = '2000-01';

export interface VersionMeta {
  version: number;
  effectiveFrom: string;
  cancelled: boolean;
}

export type SpanState = 'current' | 'past' | 'future' | 'superseded' | 'cancelled';

export interface Span<T> {
  item: T;
  from: string;
  /** Last period it applies to (inclusive); null = open-ended. Superseded / cancelled: null. */
  to: string | null;
  state: SpanState;
}

export function addMonths(period: string, n: number): string {
  const [y, m] = period.split('-').map(Number);
  const i = y * 12 + (m - 1) + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
}

/** Version that applies to a period, or null. */
export function effectiveAt<T extends VersionMeta>(versions: T[], period: string): T | null {
  let best: T | null = null;
  for (const v of versions) {
    if (v.cancelled || v.effectiveFrom > period) continue;
    if (!best || v.effectiveFrom > best.effectiveFrom || (v.effectiveFrom === best.effectiveFrom && v.version > best.version)) best = v;
  }
  return best;
}

/** Every version with its effective range, newest version first. `today` is the current period. */
export function timeline<T extends VersionMeta>(versions: T[], today: string): Span<T>[] {
  const active = versions.filter((v) => !v.cancelled);
  // winners: highest version for each start period, in start order
  const byFrom = new Map<string, T>();
  for (const v of active) {
    const w = byFrom.get(v.effectiveFrom);
    if (!w || v.version > w.version) byFrom.set(v.effectiveFrom, v);
  }
  const starts = [...byFrom.keys()].sort();
  const spans = new Map<T, Span<T>>();
  starts.forEach((from, i) => {
    const item = byFrom.get(from)!;
    const to = i + 1 < starts.length ? addMonths(starts[i + 1], -1) : null;
    const state: SpanState = from > today ? 'future' : to !== null && to < today ? 'past' : 'current';
    spans.set(item, { item, from, to, state });
  });
  return [...versions]
    .sort((a, b) => b.version - a.version)
    .map((v) => spans.get(v) ?? { item: v, from: v.effectiveFrom, to: null, state: v.cancelled ? 'cancelled' : 'superseded' });
}

/** "07/2026"; the BEGINNING period reads "từ đầu". */
export function periodLabel(p: string | null): string {
  if (p === null) return 'hiện hành';
  if (p <= BEGINNING) return 'từ đầu';
  const [y, m] = p.split('-');
  return `${m}/${y}`;
}

export const STATE_LABEL: Record<SpanState, string> = {
  current: 'Hiện hành',
  past: 'Đã hết hiệu lực',
  future: 'Sắp áp dụng',
  superseded: 'Bị thay thế',
  cancelled: 'Đã huỷ hiệu lực',
};

/** Current payroll period in Vietnam time (UTC+7). */
export function currentPeriod(now = Date.now()): string {
  const d = new Date(now + 7 * 3600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
