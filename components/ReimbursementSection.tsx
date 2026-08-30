"use client";

import { useState } from "react";
import { Trash2Icon } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import type { Claim } from "@/lib/db/reimbursements";
import type { StoredTransaction } from "@/lib/db/transactions";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Reimbursements } from "@/lib/transactions/summary";

type Result = { ok: boolean; error?: string };
const CASH = "__cash__";

interface Props {
  reimbursements: Reimbursements;
  /** Incoming credits that a repayment can be linked to. */
  candidateCredits: StoredTransaction[];
  onUpdateClaim: (
    claimId: string,
    body: Record<string, unknown>,
  ) => Promise<Result>;
  onDeleteClaim: (claimId: string) => Promise<Result>;
  onRecordRepayment: (
    claimId: string,
    body: { txnId: string | null; amount: number },
  ) => Promise<Result>;
  onDeleteRepayment: (repaymentId: string) => Promise<Result>;
}

export default function ReimbursementSection({
  reimbursements,
  candidateCredits,
  onUpdateClaim,
  onDeleteClaim,
  onRecordRepayment,
  onDeleteRepayment,
}: Props) {
  if (!reimbursements.anyClaims) return null;

  const creditById = new Map(candidateCredits.map((c) => [c.id, c]));
  const grandTotal = reimbursements.people.reduce((n, p) => n + p.openTotal, 0);

  return (
    <Card>
      <CardHeader className="flex-row items-baseline justify-between">
        <CardTitle>Owed to you</CardTitle>
        <span className="text-info font-semibold tabular-nums">
          {formatMoney(grandTotal)}
          {reimbursements.people.some((p) => p.hasUnknown) ? " + TBD" : ""}
        </span>
      </CardHeader>
      <CardContent className="space-y-6">
        {reimbursements.hints.length > 0 && (
          <section className="space-y-2">
            <h4 className="text-sm font-medium">Possible repayments</h4>
            {reimbursements.hints.map(({ credit, claim, claimTxn }) => (
              <div
                key={`${credit.id}-${claim.id}`}
                className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1">
                  {credit.date} · {credit.description} ·{" "}
                  {formatMoney(credit.amount)}
                  <span className="text-muted-foreground">
                    {" "}
                    matches {claim.person}&apos;s {claimTxn.description}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    onRecordRepayment(claim.id, {
                      txnId: credit.id,
                      amount: Math.min(
                        credit.amount,
                        claim.outstanding ?? credit.amount,
                      ),
                    })
                  }
                >
                  Link
                </Button>
              </div>
            ))}
          </section>
        )}

        {reimbursements.people.map((person) => (
          <section key={person.person} className="space-y-2">
            <h4 className="flex items-baseline justify-between text-sm font-medium">
              <span>{person.person}</span>
              <span className="text-muted-foreground tabular-nums">
                {person.openTotal > 0 ? formatMoney(person.openTotal) : "—"}
                {person.hasUnknown ? " + TBD" : ""} outstanding
              </span>
            </h4>
            <Table>
              <TableBody>
                {person.claims.map(({ claim, txn }) => {
                  const closed = claim.status !== "open";
                  return (
                    <TableRow
                      key={claim.id}
                      className={cn("align-top", closed && "opacity-60")}
                    >
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {txn.date}
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <div>{txn.description}</div>
                        <div className="text-muted-foreground text-xs">
                          {claim.expected == null
                            ? "amount TBD"
                            : `expected ${formatMoney(claim.expected)}`}
                          {claim.repaid > 0
                            ? ` · repaid ${formatMoney(claim.repaid)}`
                            : ""}
                          {claim.outstanding != null && claim.status === "open"
                            ? ` · outstanding ${formatMoney(claim.outstanding)}`
                            : ""}
                          {closed ? ` · ${claim.status}` : ""}
                          {claim.followedUpAt
                            ? ` · followed up ${claim.followedUpAt.slice(0, 10)}`
                            : ""}
                        </div>

                        {claim.repayments.length > 0 && (
                          <ul className="text-muted-foreground mt-1 space-y-0.5 text-xs">
                            {claim.repayments.map((r) => (
                              <li
                                key={r.id}
                                className="flex items-center gap-1"
                              >
                                <span>
                                  {formatMoney(r.amount)} —{" "}
                                  {r.txnId == null
                                    ? "cash"
                                    : (creditById.get(r.txnId)?.description ??
                                      "linked credit")}
                                </span>
                                <button
                                  type="button"
                                  aria-label="Remove repayment"
                                  className="hover:text-foreground underline"
                                  onClick={() => onDeleteRepayment(r.id)}
                                >
                                  ×
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}

                        {claim.status === "open" && (
                          <RepaymentRecorder
                            claim={claim}
                            candidateCredits={candidateCredits}
                            onRecord={onRecordRepayment}
                          />
                        )}

                        <div className="mt-1 flex flex-wrap gap-1">
                          {claim.status === "open" ? (
                            <>
                              <Button
                                size="sm"
                                variant={
                                  claim.followedUpAt ? "secondary" : "outline"
                                }
                                onClick={() =>
                                  onUpdateClaim(claim.id, {
                                    followedUp: !claim.followedUpAt,
                                  })
                                }
                              >
                                {claim.followedUpAt
                                  ? "Followed up ✓"
                                  : "Followed up"}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  onUpdateClaim(claim.id, { status: "settled" })
                                }
                              >
                                Settled
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  onUpdateClaim(claim.id, {
                                    status: "written_off",
                                  })
                                }
                              >
                                Write off
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                onUpdateClaim(claim.id, { status: "open" })
                              }
                            >
                              Reopen
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          aria-label="Remove claim"
                          onClick={() => onDeleteClaim(claim.id)}
                        >
                          <Trash2Icon />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </section>
        ))}
      </CardContent>
    </Card>
  );
}

function RepaymentRecorder({
  claim,
  candidateCredits,
  onRecord,
}: {
  claim: Claim;
  candidateCredits: StoredTransaction[];
  onRecord: (
    claimId: string,
    body: { txnId: string | null; amount: number },
  ) => Promise<Result>;
}) {
  const [source, setSource] = useState<string | undefined>();
  const [amount, setAmount] = useState(
    claim.outstanding != null && claim.outstanding > 0
      ? claim.outstanding.toFixed(2)
      : "",
  );
  const [busy, setBusy] = useState(false);

  const n = Number.parseFloat(amount);
  const ok = source !== undefined && Number.isFinite(n) && n > 0;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2">
      <Select value={source} onValueChange={setSource}>
        <SelectTrigger className="h-8 w-56 text-xs">
          <SelectValue placeholder="Record a repayment…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={CASH}>Cash / outside the bank</SelectItem>
          {candidateCredits.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.date} · {c.description} · {formatMoney(c.amount)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        className="h-8 w-24"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <Button
        size="sm"
        variant="outline"
        disabled={!ok || busy}
        onClick={async () => {
          if (!ok) return;
          setBusy(true);
          await onRecord(claim.id, {
            txnId: source === CASH ? null : (source as string),
            amount: n,
          });
          setBusy(false);
          setSource(undefined);
        }}
      >
        Add
      </Button>
    </div>
  );
}
