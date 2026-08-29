import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border p-3", className)}>
      <div className="text-2xl font-semibold tracking-tight tabular-nums">
        {value}
      </div>
      <div className="text-muted-foreground text-xs">
        {label}
        {hint && <span className="opacity-70"> · {hint}</span>}
      </div>
    </div>
  );
}
