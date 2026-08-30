"use client";

import { UsersIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { Claim } from "@/lib/db/reimbursements";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Marker on a fronted debit that has reimbursement claims. */
export default function ReimbursementChip({
  claims,
}: {
  claims: Claim[] | undefined;
}) {
  if (!claims || claims.length === 0) return null;

  const open = claims.filter((c) => c.status === "open");
  const openTotal = open.reduce((n, c) => n + (c.expected ?? 0), 0);
  const someUnknown = open.some((c) => c.expected === null);

  const label =
    open.length === 0
      ? "reimbursement settled"
      : `${open.length} owe${open.length === 1 ? "s" : ""} you${
          openTotal > 0 ? ` ${formatMoney(openTotal)}` : ""
        }${someUnknown ? " + TBD" : ""}`;

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1",
        open.length === 0
          ? "border-success/40 text-success"
          : "border-info/40 text-info",
      )}
      title={claims
        .map(
          (c) =>
            `${c.person}: ${
              c.expected == null ? "?" : formatMoney(c.expected)
            } (${c.status})`,
        )
        .join("\n")}
    >
      <UsersIcon className="size-3" />
      {label}
    </Badge>
  );
}
