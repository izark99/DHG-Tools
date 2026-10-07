import type { PeriodType, Scalar } from './types';

export const pad2 = (n: number) => String(n).padStart(2, '0');

export function quarterOf(month: number): number {
  return Math.floor((month - 1) / 3) + 1;
}

export function halfOf(month: number): number {
  return month <= 6 ? 1 : 2;
}

/** T09.2026 / Q03.2026 / H02.2026 / 2026 */
export function periodLabel(type: PeriodType, month: number, year: number): string {
  switch (type) {
    case 'M':
      return `T${pad2(month)}.${year}`;
    case 'Q':
      return `Q${pad2(quarterOf(month))}.${year}`;
    case 'H':
      return `H${pad2(halfOf(month))}.${year}`;
    case 'Y':
      return String(year);
  }
}

/** Replace {name} placeholders; unknown names are left as they are. */
export function fillTemplate(tpl: string, vars: Record<string, Scalar | undefined>): string {
  return tpl.replace(/\{([A-Za-z_][A-Za-z0-9_.]*)\}/g, (m, name: string) => {
    const v = vars[name];
    return v === undefined || v === null ? (name in vars ? '' : m) : String(v);
  });
}

export function runVars(run: Record<string, Scalar>): Record<string, Scalar> {
  const month = Number(run.month);
  const year = Number(run.year);
  return {
    ...run,
    MM: pad2(month),
    M: String(month),
    YYYY: String(year),
    Q: String(quarterOf(month)),
    QQ: pad2(quarterOf(month)),
    H: String(halfOf(month)),
  };
}

export function normKey(v: unknown): string {
  return v === null || v === undefined ? '' : String(v).trim().toUpperCase();
}
