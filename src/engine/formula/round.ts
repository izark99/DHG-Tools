// Excel-compatible rounding: half away from zero, applied after cutting the
// value to 15 significant digits (which is what makes ROUND(1.005,2) = 1.01).

function scaled(n: number, digits: number): number {
  const factor = Math.pow(10, digits);
  const x = Math.abs(n) * factor;
  return Number(x.toPrecision(15));
}

function unscale(x: number, n: number, digits: number): number {
  const factor = Math.pow(10, digits);
  const r = digits >= 0 ? x / factor : x * Math.pow(10, -digits);
  const v = n < 0 ? -r : r;
  return v === 0 ? 0 : Number(v.toPrecision(15));
}

export function excelRound(n: number, digits = 0): number {
  const d = Math.trunc(digits);
  return unscale(Math.round(scaled(n, d)), n, d);
}

export function excelRoundUp(n: number, digits = 0): number {
  const d = Math.trunc(digits);
  return unscale(Math.ceil(scaled(n, d)), n, d);
}

export function excelRoundDown(n: number, digits = 0): number {
  const d = Math.trunc(digits);
  return unscale(Math.floor(scaled(n, d)), n, d);
}
