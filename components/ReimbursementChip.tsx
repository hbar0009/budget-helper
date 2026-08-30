"use client";

import { Undo2Icon, UsersIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { Claim, Repayment } from "@/lib/db/reimbursements";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Markers for a transaction's reimbursement state: claims (on a fronted debit)
 * and/or repayments it funds (on an incoming credit).
 */
export default function ReimbursementChip({
  claims,
  repaymentsFunded,
}: {
  claims?: Claim[];
  repaymentsFunded?: Repayment[];
}) {
  const hasClaims = claims && claims.length > 0;
  const hasRepayments = repaymentsFunded && repaymentsFunded.length > 0;
  if (!hasClaims && !hasRepayments) return null;

  return (
    <>
      {hasClaims && <ClaimsBadge claims={claims} />}
      {hasRepayments && <RepaidBadge repayments={repaymentsFunded} />}
    </>
  );
}

function ClaimsBadge({ claims }: { claims: Claim[] }) {
  const open = claims.filter((c) => c.status === "open");
  const openTotal = open.reduce((n, c) => n + (c.outstanding ?? 0), 0);
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
            } repaid ${formatMoney(c.repaid)} (${c.status})`,
        )
        .join("\n")}
    >
      <UsersIcon className="size-3" />
      {label}
    </Badge>
  );
}

function RepaidBadge({ repayments }: { repayments: Repayment[] }) {
  const total = repayments.reduce((n, r) => n + r.amount, 0);
  return (
    <Badge variant="outline" className="border-success/40 text-success gap-1">
      <Undo2Icon className="size-3" />
      repayment {formatMoney(total)}
    </Badge>
  );
}
