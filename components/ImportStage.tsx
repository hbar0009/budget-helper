"use client";

import { useEffect, useState } from "react";
import { UploadCloudIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
import { StatCard } from "@/components/StatCard";
import type { TransferSummary, ImportRowError } from "@/lib/transactions/types";

interface AccountOption {
  id: string;
  label: string;
  type: string;
  group: string;
}

interface FileAssignment {
  file: File;
  accountId: string;
}

interface ImportResponse {
  batch: { total: number; inserted: number; alreadyPresent: number };
  transfers: TransferSummary;
  counts: { pending: number; categorized: number; skipped: number };
  errors: ImportRowError[];
}

export default function ImportStage({
  onImported,
}: {
  onImported: () => void;
}) {
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<FileAssignment[]>([]);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/accounts")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load accounts.");
        setAccounts(data.accounts as AccountOption[]);
      })
      .catch((err: Error) => setAccountsError(err.message));
  }, []);

  function onFilesChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    setResult(null);
    setError(null);
    setAssignments(
      files.map((file) => ({
        file,
        accountId: guessAccount(file.name, accounts),
      })),
    );
  }

  function setAccountFor(index: number, accountId: string) {
    setAssignments((prev) =>
      prev.map((a, i) => (i === index ? { ...a, accountId } : a)),
    );
  }

  async function submit() {
    setBusy(true);
    setError(null);
    setResult(null);

    const body = new FormData();
    for (const { file, accountId } of assignments) {
      body.append("file", file);
      body.append("accountId", accountId);
    }

    try {
      const res = await fetch("/api/import", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Import failed (${res.status}).`);
        return;
      }
      setResult(data as ImportResponse);
    } catch {
      setError("Could not reach the import endpoint.");
    } finally {
      setBusy(false);
    }
  }

  if (accountsError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{accountsError}</AlertDescription>
      </Alert>
    );
  }

  if (result) {
    return (
      <ImportSummary
        result={result}
        onContinue={onImported}
        onDiscard={() => {
          setResult(null);
          setAssignments([]);
        }}
      />
    );
  }

  const ready =
    assignments.length > 0 && assignments.every((a) => a.accountId !== "");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import statements</CardTitle>
        <CardDescription>
          Select every account&apos;s CSV for the same date range at once, then
          say which account each file is. Re-importing a statement is safe —
          rows already on file are left as they are.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="border-input text-muted-foreground hover:bg-accent/40 flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-8 text-center text-sm transition-colors">
          <UploadCloudIcon className="text-muted-foreground/70 mb-1 size-6" />
          <span className="text-foreground font-medium">Choose CSV files</span>
          <span>one per account</span>
          <input
            type="file"
            accept=".csv,text/csv"
            multiple
            className="hidden"
            onChange={onFilesChosen}
            disabled={busy}
          />
        </label>

        {assignments.length > 0 && (
          <div className="space-y-2">
            {assignments.map((a, i) => (
              <div
                key={a.file.name}
                className="bg-muted/40 flex items-center gap-3 rounded-lg border px-3 py-2"
              >
                <span className="flex-1 truncate font-mono text-xs">
                  {a.file.name}
                </span>
                <Select
                  value={a.accountId}
                  onValueChange={(v) => setAccountFor(i, v)}
                  disabled={busy}
                >
                  <SelectTrigger className="w-52">
                    <SelectValue placeholder="Pick an account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}

        {assignments.length > 0 && (
          <Button onClick={submit} disabled={!ready || busy}>
            {busy ? "Importing…" : "Import & reconcile"}
          </Button>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function ImportSummary({
  result,
  onContinue,
  onDiscard,
}: {
  result: ImportResponse;
  onContinue: () => void;
  onDiscard: () => void;
}) {
  const { batch, transfers, counts, errors } = result;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Imported</CardTitle>
        <CardDescription>
          Parsed, reconciled, and saved. Nothing is written to a spreadsheet yet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <StatCard label="In this file set" value={batch.total} />
          <StatCard label="Newly added" value={batch.inserted} />
          <StatCard
            label="Already on file"
            value={batch.alreadyPresent}
            hint="unchanged"
          />
          <StatCard label="Netted pairs" value={transfers.nettedPairs} hint="excluded" />
          <StatCard label="Cross-group" value={transfers.crossGroupPairs} hint="kept" />
          <StatCard label="Unmatched" value={transfers.unmatched} hint="review" />
        </div>

        <p className="text-muted-foreground text-sm">
          {counts.pending} transaction{counts.pending === 1 ? "" : "s"} waiting to
          be categorized.
        </p>

        {errors.length > 0 && (
          <Alert variant="destructive">
            <AlertDescription>
              <ul className="list-disc pl-4">
                {errors.map((e, i) => (
                  <li key={`${e.accountId ?? "?"}-${e.row}-${i}`}>
                    {e.accountId ?? "?"} row {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={onContinue}>Categorize →</Button>
          <Button variant="ghost" onClick={onDiscard}>
            Import more files
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Best-effort pre-selection: pick the account whose label words all appear in
 * the filename. The dropdown stays the source of truth.
 */
function guessAccount(filename: string, accounts: AccountOption[]): string {
  const lower = filename.toLowerCase();
  const hit = accounts.find((account) =>
    account.label
      .toLowerCase()
      .split(/\s+/)
      .every((word) => lower.includes(word)),
  );
  return hit?.id ?? "";
}
