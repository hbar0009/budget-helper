"use client";

import { useMemo, useState } from "react";
import { Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import type { StoredTransaction } from "@/lib/db/transactions";
import type { WrongAccountData } from "@/lib/db/flags";
import { formatSigned } from "@/lib/format";
import type { FollowUps } from "@/lib/transactions/summary";

type Result = { ok: boolean; error?: string };

interface Props {
  followUps: FollowUps;
  transactions: StoredTransaction[];
  onUpdateFlag: (flagId: string, body: Record<string, unknown>) => Promise<Result>;
  onDeleteFlag: (flagId: string) => Promise<Result>;
}

export default function FollowUpSection({
  followUps,
  transactions,
  onUpdateFlag,
  onDeleteFlag,
}: Props) {
  const { wrongAccount, notes } = followUps;
  if (wrongAccount.length === 0 && notes.length === 0) return null;

  const byId = new Map(transactions.map((t) => [t.id, t]));
  const openCount = wrongAccount.filter((w) => w.flag.status === "open").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Needs follow-up</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {wrongAccount.length > 0 && (
          <section className="space-y-2">
            <h4 className="text-sm font-medium">
              Wrong account · {openCount} open
              {wrongAccount.length - openCount > 0 &&
                ` · ${wrongAccount.length - openCount} corrected`}
            </h4>
            <Table>
              <TableBody>
                {wrongAccount.map(({ txn, flag }) => {
                  const data = flag.data as WrongAccountData;
                  const corrective = data.correctedByTxnId
                    ? byId.get(data.correctedByTxnId)
                    : undefined;
                  return (
                    <TableRow key={flag.id} className="align-top">
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {txn.date}
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <div>{txn.description}</div>
                        <div className="text-muted-foreground text-xs">
                          {txn.accountId} →{" "}
                          {data.shouldBeAccountId ??
                            data.shouldBeGroup ??
                            "unspecified"}
                          {data.note ? ` · ${data.note}` : ""}
                        </div>
                        {flag.status === "open" ? (
                          <CorrectionLinker
                            txn={txn}
                            transactions={transactions}
                            onLink={(correctedByTxnId) =>
                              onUpdateFlag(flag.id, {
                                status: "resolved",
                                correctedByTxnId,
                              })
                            }
                          />
                        ) : (
                          <div className="text-success mt-1 text-xs">
                            ✓ corrected by{" "}
                            {corrective
                              ? `${corrective.date} · ${corrective.description}`
                              : "a linked transfer"}
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-foreground ml-2 underline"
                              onClick={() =>
                                onUpdateFlag(flag.id, { status: "open" })
                              }
                            >
                              reopen
                            </button>
                          </div>
                        )}
                      </TableCell>
                      <TableCell
                        className={
                          "text-right tabular-nums " +
                          (txn.amount < 0 ? "text-destructive" : "text-success")
                        }
                      >
                        {formatSigned(txn.amount)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          aria-label="Remove flag"
                          onClick={() => onDeleteFlag(flag.id)}
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
        )}

        {notes.length > 0 && (
          <section className="space-y-2">
            <h4 className="text-sm font-medium">Notes · {notes.length}</h4>
            <Table>
              <TableBody>
                {notes.map(({ txn, flag }) => (
                  <TableRow key={flag.id} className="align-top">
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {txn.date}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <div>{txn.description}</div>
                      <div className="text-muted-foreground text-xs">
                        {"text" in flag.data ? flag.data.text : ""}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatSigned(txn.amount)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label="Remove flag"
                        onClick={() => onDeleteFlag(flag.id)}
                      >
                        <Trash2Icon />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        )}
      </CardContent>
    </Card>
  );
}

function CorrectionLinker({
  txn,
  transactions,
  onLink,
}: {
  txn: StoredTransaction;
  transactions: StoredTransaction[];
  onLink: (correctedByTxnId: string) => Promise<Result>;
}) {
  const [pick, setPick] = useState<string | undefined>();
  const [anyAmount, setAnyAmount] = useState(false);
  const [busy, setBusy] = useState(false);

  const candidates = useMemo(() => {
    const target = Math.abs(txn.amount);
    return transactions
      .filter(
        (c) =>
          c.id !== txn.id &&
          c.transferState !== "netted" &&
          (anyAmount || Math.abs(Math.abs(c.amount) - target) < 0.005),
      )
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, txn, anyAmount]);

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <Select value={pick} onValueChange={setPick}>
        <SelectTrigger className="h-8 w-64 text-xs">
          <SelectValue placeholder="Link the correcting transfer…" />
        </SelectTrigger>
        <SelectContent>
          {candidates.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.date} · {c.description} · {formatSigned(c.amount)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <label className="text-muted-foreground flex items-center gap-1 text-xs">
        <input
          type="checkbox"
          className="size-3.5 accent-current"
          checked={anyAmount}
          onChange={(e) => setAnyAmount(e.target.checked)}
        />
        any amount
      </label>
      <Button
        size="sm"
        variant="outline"
        disabled={!pick || busy}
        onClick={async () => {
          if (!pick) return;
          setBusy(true);
          await onLink(pick);
          setBusy(false);
        }}
      >
        Link
      </Button>
    </div>
  );
}
