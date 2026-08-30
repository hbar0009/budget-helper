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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { AccountLite } from "@/hooks/useAccounts";
import type { Flag, FlagKind, WrongAccountData } from "@/lib/db/flags";
import type { StoredTransaction } from "@/lib/db/transactions";
import { formatSigned } from "@/lib/format";

type Result = { ok: boolean; error?: string };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: StoredTransaction;
  accounts: AccountLite[] | null;
  onAdd: (kind: FlagKind, data: unknown) => Promise<Result>;
  onDelete: (flagId: string) => Promise<Result>;
}

/**
 * Add / remove follow-up flags on a transaction. Wrong-account flags get
 * resolved (linked to a correcting transfer) from the review screen, not here.
 */
export default function FlagDialog({
  open,
  onOpenChange,
  transaction,
  accounts,
  onAdd,
  onDelete,
}: Props) {
  const [kind, setKind] = useState<FlagKind>("wrong_account");
  const [shouldBeAccountId, setShouldBeAccountId] = useState("");
  const [wrongAccountNote, setWrongAccountNote] = useState("");
  const [noteText, setNoteText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setKind("wrong_account");
    setShouldBeAccountId("");
    setWrongAccountNote("");
    setNoteText("");
    setBusy(false);
    setError(null);
  }, [open, transaction.id]);

  const otherAccounts = (accounts ?? []).filter(
    (a) => a.id !== transaction.accountId,
  );
  const accountLabel = (id: string | undefined) =>
    accounts?.find((a) => a.id === id)?.label ?? id;

  const canAdd =
    !busy &&
    (kind === "note"
      ? noteText.trim().length > 0
      : shouldBeAccountId !== "" || wrongAccountNote.trim().length > 0);

  async function add() {
    if (!canAdd) return;
    setBusy(true);
    setError(null);
    const data =
      kind === "note"
        ? { text: noteText.trim() }
        : {
            shouldBeAccountId: shouldBeAccountId || undefined,
            shouldBeGroup: otherAccounts.find((a) => a.id === shouldBeAccountId)
              ?.group,
            note: wrongAccountNote.trim() || undefined,
          };
    const res = await onAdd(kind, data);
    setBusy(false);
    if (res.ok) {
      setShouldBeAccountId("");
      setWrongAccountNote("");
      setNoteText("");
    } else {
      setError(res.error ?? "Could not add the flag.");
    }
  }

  async function remove(flagId: string) {
    setBusy(true);
    setError(null);
    const res = await onDelete(flagId);
    setBusy(false);
    if (!res.ok) setError(res.error ?? "Could not remove the flag.");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Flag transaction</DialogTitle>
          <DialogDescription>
            {transaction.date} · {transaction.description} ·{" "}
            {formatSigned(transaction.amount)} · {transaction.accountId}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {transaction.flags.length > 0 && (
            <div className="space-y-2">
              <Label>On this transaction</Label>
              {transaction.flags.map((flag) => (
                <div
                  key={flag.id}
                  className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{summaryTitle(flag)}</span>
                    <span className="text-muted-foreground block">
                      {summaryDetail(flag, accountLabel)}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0"
                    aria-label="Remove flag"
                    disabled={busy}
                    onClick={() => remove(flag.id)}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3 border-t pt-4">
            <Label>Add a flag</Label>
            <div className="flex gap-1">
              {(
                [
                  ["wrong_account", "Wrong account"],
                  ["note", "Note"],
                ] as const
              ).map(([value, text]) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={kind === value ? "default" : "outline"}
                  onClick={() => setKind(value)}
                >
                  {text}
                </Button>
              ))}
            </div>

            {kind === "wrong_account" ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="flag-should-be">Should have been paid from</Label>
                  <Select
                    value={shouldBeAccountId || undefined}
                    onValueChange={setShouldBeAccountId}
                  >
                    <SelectTrigger id="flag-should-be" className="w-full">
                      <SelectValue placeholder="Pick an account (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {otherAccounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.label} · {a.group}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="flag-wa-note">Note (optional)</Label>
                  <Input
                    id="flag-wa-note"
                    value={wrongAccountNote}
                    onChange={(e) => setWrongAccountNote(e.target.value)}
                    placeholder="e.g. move this to personal next time I'm in the app"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="flag-note">What needs doing?</Label>
                <Textarea
                  id="flag-note"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="e.g. check if this is a duplicate charge"
                />
              </div>
            )}

            <Button onClick={add} disabled={!canAdd}>
              {busy ? "Saving…" : "Add flag"}
            </Button>
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

function summaryTitle(flag: Flag): string {
  if (flag.kind === "note") return "Note";
  return flag.status === "open" ? "Wrong account" : "Wrong account — corrected";
}

function summaryDetail(
  flag: Flag,
  accountLabel: (id: string | undefined) => string | undefined,
): string {
  if (flag.kind === "note") {
    return "text" in flag.data ? flag.data.text : "";
  }
  const data = flag.data as WrongAccountData;
  const target =
    accountLabel(data.shouldBeAccountId) ?? data.shouldBeGroup ?? "unspecified";
  return [`should be ${target}`, data.note].filter(Boolean).join(" · ");
}
