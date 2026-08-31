/**
 * Shared chart chrome for the Analysis view. Colours are CSS custom properties
 * (`--chart-*` in `app/globals.css`, validated data-viz palette) referenced
 * straight in SVG fills/strokes, so dark mode swaps them with no JS.
 */

export const CHART = {
  seq: "var(--chart-seq)",
  pos: "var(--chart-pos)",
  neg: "var(--chart-neg)",
  other: "var(--chart-other)",
  grid: "var(--chart-grid)",
  axis: "var(--chart-axis)",
  label: "var(--chart-label)",
  surface: "var(--chart-surface)",
} as const;

/** Categorical band colour for slot `i` (0-based); slot 7+ and "Other" fold to grey. */
export function bandColor(i: number, name?: string): string {
  if (name === "Other" || i >= 6) return CHART.other;
  return `var(--chart-cat-${i + 1})`;
}

export const axisTick = { fill: CHART.label, fontSize: 11 } as const;

/** `"2026-01"` -> `"Jan"` (append `"'26"` in January so the year is visible). */
export function monthShort(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const name = new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: "short",
  });
  return m === 1 ? `${name} '${String(y).slice(2)}` : name;
}

/** `"2026-01"` -> `"January 2026"`. */
export function monthLong(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

/** `-1234.5` -> `"−$1,235"`; `compact` drops to `"−$1.2k"` for axis ticks. */
export function money(n: number, compact = false): string {
  const sign = n < 0 ? "−" : "";
  const abs = Math.abs(n);
  if (compact && abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
  return `${sign}$${Math.round(abs).toLocaleString()}`;
}
