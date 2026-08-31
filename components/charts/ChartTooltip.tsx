"use client";

import type { ReactNode } from "react";

type Row = { name?: string; dataKey?: string | number; value?: number; color?: string };

/**
 * Recharts tooltip content styled with the app's popover tokens. Value leads
 * (Strong), series name follows, keyed by a short stroke of the mark colour.
 */
export default function ChartTooltip({
  active,
  payload,
  label,
  labelFormat,
  valueFormat,
  extra,
}: {
  active?: boolean;
  payload?: Row[];
  label?: string | number;
  labelFormat?: (l: string) => string;
  valueFormat: (n: number) => string;
  /** Optional trailing row, e.g. a total. */
  extra?: (rows: Row[]) => ReactNode;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((r) => r.value !== undefined && r.value !== 0);
  if (rows.length === 0) return null;

  return (
    <div className="bg-popover text-popover-foreground rounded-md border px-2.5 py-1.5 text-xs shadow-md">
      {label !== undefined && (
        <div className="text-muted-foreground mb-1">
          {labelFormat ? labelFormat(String(label)) : label}
        </div>
      )}
      <div className="space-y-0.5">
        {rows.map((r) => (
          <div key={String(r.dataKey)} className="flex items-center gap-2">
            <span
              className="inline-block h-[2px] w-3 shrink-0 rounded-full"
              style={{ background: r.color }}
            />
            <span className="flex-1 whitespace-nowrap">{r.name ?? r.dataKey}</span>
            <span className="font-semibold tabular-nums">
              {valueFormat(r.value as number)}
            </span>
          </div>
        ))}
        {extra?.(rows)}
      </div>
    </div>
  );
}
