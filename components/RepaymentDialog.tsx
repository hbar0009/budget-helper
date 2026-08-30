"use client";

import { useEffect, useMemo, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Claim } from "@/lib/db/reimbursements";
import type { StoredTransaction } from "@/lib/db/transactions";
import { formatMoney, formatSigned } from "@/lib/format";

type Result = { ok: boolean; error?: string };
type OpenClaim = { claim: Claim; txn: StoredTransaction };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The incoming credit being linked. */
  credit: StoredTransaction;
  /** Every still-open claim, across all transactions. */
  openClaims: OpenClaim[];
  onSubmit: (
    rows: { claimId: string; amount: number }[],
  ) => Promise<Result>;
}

/** Link one incoming credit to the claims it repays (one or several people). */
export default function RepaymentDialog({
  open,
  onOpenChange,
  credit,
  openClaims,
  onSubmit,
}: Props) {
  // claimId -> amount string; absent = not ticked.
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPicks({});
    setBusy(false);
    setError(null);
  }, [open, credit.id]);

  const parsed = useMemo(
    () =>
      Object.entries(picks).map(([claimId, raw]) => {
        const n = Number.parseFloat(raw);
        return { claimId, amount: Number.isFinite(n) ? n : NaN };
      }),
    [picks],
  );
  const applied = parsed.reduce((n, r) => n + (r.amount > 0 ? r.amount : 0), 0);
  const remaining = Math.round((credit.amount - applied) * 100) / 100;
  const overApplied = applied > credit.amount + 0.005;
  const canSubmit =
    !busy &&
    parsed.length > 0 &&
    parsed.every((r) => r.amount > 0) &&
    !overApplied;

  function toggle(claim: Claim) {
    setPicks((prev) => {
      if (claim.id in prev) {
        const next = { ...prev };
        delete next[claim.id];
        return next;
      }
      const alreadyApplied = Object.entries(prev).reduce((n, [, raw]) => {
        const v = Number.parseFloat(raw);
        return n + (Number.isFinite(v) && v > 0 ? v : 0);
      }, 0);
      const left = Math.round((credit.amount - alreadyApplied) * 100) / 100;
      const want = claim.outstanding ?? left;
      const seed = Math.max(0, Math.min(want, left));
      return { ...prev, [claim.id]: seed ? seed.toFixed(2) : "" };
    });
  }

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const res = await onSubmit(
      parsed.map((r) => ({ claimId: r.claimId, amount: r.amount })),
    );
    setBusy(false);
    if (res.ok) onOpenChange(false);
    else setError(res.error ?? "Could not link the repayment.");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Link repayment</DialogTitle>
          <DialogDescription>
            {credit.date} · {credit.description} · {formatSigned(credit.amount)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {openClaims.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No open claims to link this to.
            </p>
          ) : (
            <>
              <Label>Who is this paying you back for?</Label>
              <div className="space-y-1">
                {openClaims.map(({ claim, txn }) => {
                  const ticked = claim.id in picks;
                  return (
                    <div
                      key={claim.id}
                      className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        className="size-4 shrink-0 accent-current"
                        checked={ticked}
                        onChange={() => toggle(claim)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{claim.person}</span>
                        <span className="text-muted-foreground">
                          {" · "}
                          {txn.date} {txn.description}
                          {" · outstanding "}
                          {claim.outstanding == null
                            ? "TBD"
                            : formatMoney(claim.outstanding)}
                        </span>
                      </span>
                      {ticked && (
                        <Input
                          className="h-8 w-24"
                          inputMode="decimal"
                          value={picks[claim.id]}
                          onChange={(e) =>
                            setPicks((p) => ({
                              ...p,
                              [claim.id]: e.target.value,
                            }))
                          }
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              <p className="text-muted-foreground text-xs">
                Applying{" "}
                <span className="text-foreground font-medium">
                  {formatMoney(applied)}
                </span>{" "}
                of {formatMoney(credit.amount)}
                {remaining > 0 ? ` · ${formatMoney(remaining)} left over` : ""}
                {overApplied ? " · more than the credit!" : ""}
              </p>
            </>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {busy ? "Linking…" : "Link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
