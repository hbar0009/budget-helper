/** Presentational money formatting. `−` is the Unicode minus, not a hyphen. */

export function formatMoney(n: number): string {
  return `${n < 0 ? "−" : ""}$${Math.abs(n).toFixed(2)}`;
}

export function formatSigned(n: number): string {
  return `${n < 0 ? "−" : "+"}$${Math.abs(n).toFixed(2)}`;
}
