"use client";

import { useEffect, useState } from "react";
import { Trash2Icon } from "lucide-react";

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
import type { StoredTransaction } from "@/lib/db/transactions";
import { formatMoney, formatSigned } from "@/lib/format";

type Result = { ok: boolean; error?: string };
type ClaimInput = { person: string; expected: number | null; note: string | null };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: StoredTransaction;
  onAdd: (claims: ClaimInput[]) => Promise<Result>;
  onUpdate: (
    claimId: string,
    body: Record<string, unknown>,
  ) => Promise<Result>;
  onDelete: (claimId: string) => Promise<Result>;
}

interface DraftRow {
  person: string;
  amount: string;
}

const emptyRow = (): DraftRow => ({ person: "", amount: "" });

/**
 * Split a fronted debit among the people who owe a share. Each row becomes a
 * "person owes you $X" claim; settling / writing off happens in the review.
 */
export default function SplitDialog({
  open,
  onOpenChange,
  transaction,
  onAdd,
  onUpdate,
  onDelete,
}: Props) {
  const gross = Math.abs(transaction.amount);

  const [rows, setRows] = useState<DraftRow[]>([emptyRow()]);
  const [evenTotal, setEvenTotal] = useState(String(gross.toFixed(2)));
  const [evenCount, setEvenCount] = useState("2");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per-claim edit state, keyed by claim id.
  const [edits, setEdits] = useState<Record<string, DraftRow>>({});

  useEffect(() => {
    if (!open) return;
    setRows([emptyRow()]);
    setEvenTotal(gross.toFixed(2));
    setEvenCount("2");
    setBusy(false);
    setError(null);
    setEdits({});
  }, [open, transaction.id, gross]);

  const share = (() => {
    const total = Number.parseFloat(evenTotal);
    const n = Number.parseInt(evenCount, 10);
    if (!Number.isFinite(total) || !Number.isInteger(n) || n < 2) return null;
    return Math.round((total / n) * 100) / 100;
  })();

  function applyEvenSplit() {
    if (share === null) return;
    setRows((prev) =>
      (prev.length > 0 ? prev : [emptyRow()]).map((r) => ({
        ...r,
        amount: share.toFixed(2),
      })),
    );
  }

  function parseAmount(raw: string): number | null | "bad" {
    const t = raw.trim();
    if (!t) return null;
    const n = Number.parseFloat(t);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : "bad";
  }

  const draftClaims = rows
    .map((r) => ({ person: r.person.trim(), amount: parseAmount(r.amount) }))
    .filter((r) => r.person.length > 0);
  const canAdd =
    !busy &&
    draftClaims.length > 0 &&
    draftClaims.every((r) => r.amount !== "bad");

  async function add() {
    if (!canAdd) return;
    setBusy(true);
    setError(null);
    const res = await onAdd(
      draftClaims.map((r) => ({
        person: r.person,
        expected: r.amount === "bad" ? null : r.amount,
        note: null,
      })),
    );
    setBusy(false);
    if (res.ok) setRows([emptyRow()]);
    else setError(res.error ?? "Could not save the split.");
  }

  async function saveEdit(claimId: string) {
    const edit = edits[claimId];
    if (!edit) return;
    const amount = parseAmount(edit.amount);
    if (!edit.person.trim() || amount === "bad") {
      setError("Check the person and amount.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await onUpdate(claimId, {
      person: edit.person.trim(),
      expected: amount,
    });
    setBusy(false);
    if (res.ok) {
      setEdits((prev) => {
        const next = { ...prev };
        delete next[claimId];
        return next;
      });
    } else {
      setError(res.error ?? "Could not update the claim.");
    }
  }

  async function remove(claimId: string) {
    setBusy(true);
    setError(null);
    const res = await onDelete(claimId);
    setBusy(false);
    if (!res.ok) setError(res.error ?? "Could not remove the claim.");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Split this expense</DialogTitle>
          <DialogDescription>
            {transaction.date} · {transaction.description} ·{" "}
            {formatSigned(transaction.amount)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {transaction.claims.length > 0 && (
            <div className="space-y-2">
              <Label>Who owes you</Label>
              {transaction.claims.map((claim) => {
                const edit = edits[claim.id];
                return (
                  <div
                    key={claim.id}
                    className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    {edit ? (
                      <>
                        <Input
                          className="h-8 flex-1"
                          value={edit.person}
                          onChange={(e) =>
                            setEdits((p) => ({
                              ...p,
                              [claim.id]: { ...edit, person: e.target.value },
                            }))
                          }
                        />
                        <Input
                          className="h-8 w-24"
                          inputMode="decimal"
                          value={edit.amount}
                          onChange={(e) =>
                            setEdits((p) => ({
                              ...p,
                              [claim.id]: { ...edit, amount: e.target.value },
                            }))
                          }
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => saveEdit(claim.id)}
                        >
                          Save
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1">
                          <span className="font-medium">{claim.person}</span>
                          <span className="text-muted-foreground">
                            {" · "}
                            {claim.expected == null
                              ? "amount TBD"
                              : formatMoney(claim.expected)}
                            {claim.status !== "open" ? ` · ${claim.status}` : ""}
                          </span>
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setEdits((p) => ({
                              ...p,
                              [claim.id]: {
                                person: claim.person,
                                amount:
                                  claim.expected == null
                                    ? ""
                                    : String(claim.expected),
                              },
                            }))
                          }
                        >
                          Edit
                        </Button>
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0"
                      aria-label="Remove claim"
                      disabled={busy}
                      onClick={() => remove(claim.id)}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="space-y-3 border-t pt-4">
            <Label>Add people</Label>

            <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
              Even split of
              <Input
                className="h-7 w-24"
                inputMode="decimal"
                value={evenTotal}
                onChange={(e) => setEvenTotal(e.target.value)}
              />
              among
              <Input
                className="h-7 w-14"
                inputMode="numeric"
                value={evenCount}
                onChange={(e) => setEvenCount(e.target.value)}
              />
              (incl. you) →{" "}
              <span className="text-foreground font-medium">
                {share === null ? "—" : formatMoney(share)} each
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={share === null}
                onClick={applyEvenSplit}
              >
                Fill
              </Button>
            </div>

            {rows.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  placeholder="Person"
                  className="flex-1"
                  value={row.person}
                  onChange={(e) =>
                    setRows((prev) =>
                      prev.map((r, j) =>
                        j === i ? { ...r, person: e.target.value } : r,
                      ),
                    )
                  }
                />
                <Input
                  placeholder="amount"
                  inputMode="decimal"
                  className="w-24"
                  value={row.amount}
                  onChange={(e) =>
                    setRows((prev) =>
                      prev.map((r, j) =>
                        j === i ? { ...r, amount: e.target.value } : r,
                      ),
                    )
                  }
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  aria-label="Remove row"
                  disabled={rows.length === 1}
                  onClick={() =>
                    setRows((prev) => prev.filter((_, j) => j !== i))
                  }
                >
                  <Trash2Icon />
                </Button>
              </div>
            ))}

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setRows((prev) => [...prev, emptyRow()])}
              >
                ＋ Add person
              </Button>
              <Button onClick={add} disabled={!canAdd}>
                {busy ? "Saving…" : "Add to split"}
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              Leave an amount blank to record it as “TBD”. Your own share isn’t
              tracked.
            </p>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
