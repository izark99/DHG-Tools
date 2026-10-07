import { describe, expect, it } from 'vitest';
import { addMonths, BEGINNING, currentPeriod, effectiveAt, periodLabel, timeline } from './effective';

const v = (version: number, effectiveFrom: string, cancelled = false) => ({ version, effectiveFrom, cancelled });

describe('effective-dated versions', () => {
  const versions = [v(1, BEGINNING), v(2, '2026-07'), v(3, '2027-01'), v(4, '2026-07'), v(5, '2026-10', true)];

  it('picks the version that applies to a period', () => {
    expect(effectiveAt(versions, '2026-06')?.version).toBe(1);
    // same start: the higher version wins
    expect(effectiveAt(versions, '2026-07')?.version).toBe(4);
    // a cancelled version never applies
    expect(effectiveAt(versions, '2026-11')?.version).toBe(4);
    expect(effectiveAt(versions, '2027-03')?.version).toBe(3);
    expect(effectiveAt([v(1, '2026-05')], '2026-04')).toBeNull();
  });

  it('builds the timeline with closed ranges and states', () => {
    const t = timeline(versions, '2026-09').map((s) => [s.item.version, s.from, s.to, s.state]);
    expect(t).toEqual([
      [5, '2026-10', null, 'cancelled'],
      [4, '2026-07', '2026-12', 'current'],
      [3, '2027-01', null, 'future'],
      [2, '2026-07', null, 'superseded'],
      [1, BEGINNING, '2026-06', 'past'],
    ]);
  });

  it('period helpers', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(periodLabel('2026-07')).toBe('07/2026');
    expect(periodLabel(BEGINNING)).toBe('từ đầu');
    expect(periodLabel(null)).toBe('hiện hành');
    // 2026-09-30 20:00 UTC is already October in Vietnam
    expect(currentPeriod(Date.UTC(2026, 8, 30, 20))).toBe('2026-10');
  });
});
