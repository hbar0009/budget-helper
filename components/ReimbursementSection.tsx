"use client";

import { Trash2Icon } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Reimbursements } from "@/lib/transactions/summary";

type Result = { ok: boolean; error?: string };

interface Props {
  reimbursements: Reimbursements;
  onUpdateClaim: (
    claimId: string,
    body: Record<string, unknown>,
  ) => Promise<Result>;
  onDeleteClaim: (claimId: string) => Promise<Result>;
}

export default function ReimbursementSection({
  reimbursements,
  onUpdateClaim,
  onDeleteClaim,
}: Props) {
  if (!reimbursements.anyClaims) return null;

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
        {reimbursements.people.map((person) => (
          <section key={person.person} className="space-y-2">
            <h4 className="flex items-baseline justify-between text-sm font-medium">
              <span>{person.person}</span>
              <span className="text-muted-foreground tabular-nums">
                {person.openTotal > 0 ? formatMoney(person.openTotal) : "—"}
                {person.hasUnknown ? " + TBD" : ""} open
              </span>
            </h4>
            <Table>
              <TableBody>
                {person.claims.map(({ claim, txn }) => {
                  const settled = claim.status !== "open";
                  return (
                    <TableRow
                      key={claim.id}
                      className={cn("align-top", settled && "opacity-60")}
                    >
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {txn.date}
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <div>{txn.description}</div>
                        <div className="text-muted-foreground text-xs">
                          {claim.expected == null
                            ? "amount TBD"
                            : formatMoney(claim.expected)}
                          {claim.status !== "open" ? ` · ${claim.status}` : ""}
                          {claim.followedUpAt
                            ? ` · followed up ${claim.followedUpAt.slice(0, 10)}`
                            : ""}
                        </div>
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
                                {claim.followedUpAt ? "Followed up ✓" : "Followed up"}
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
