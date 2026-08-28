"use client";

import { useEffect, useState } from "react";
import type {
  MultiImportResult,
  ReconciledTransaction,
} from "@/lib/transactions/types";

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

interface Props {
  onImported: (transactions: ReconciledTransaction[]) => void;
}

export default function ImportStage({ onImported }: Props) {
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<FileAssignment[]>([]);
  const [result, setResult] = useState<MultiImportResult | null>(null);
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
      setResult(data as MultiImportResult);
    } catch {
      setError("Could not reach the import endpoint.");
    } finally {
      setBusy(false);
    }
  }

  if (accountsError) {
    return <div className="error-panel">{accountsError}</div>;
  }

  if (result) {
    return (
      <ImportSummary
        result={result}
        onContinue={() => onImported(result.transactions)}
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
    <div className="panel">
      <h2>Import statements</h2>
      <p className="muted">
        Select every account&apos;s CSV for the same date range at once, then say
        which account each file is.
      </p>

      <label className="dropzone">
        <strong>Choose CSV files</strong>
        <span className="muted">one per account</span>
        <input
          type="file"
          accept=".csv,text/csv"
          multiple
          onChange={onFilesChosen}
          disabled={busy}
        />
      </label>

      {assignments.length > 0 && (
        <>
          <div className="assign-list">
            {assignments.map((a, i) => (
              <div className="assign-row" key={a.file.name}>
                <span className="assign-row__name">{a.file.name}</span>
                <select
                  value={a.accountId}
                  onChange={(e) => setAccountFor(i, e.target.value)}
                  disabled={busy}
                >
                  <option value="">— pick an account —</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="row">
            <button
              className="btn btn-primary"
              onClick={submit}
              disabled={!ready || busy}
            >
              {busy ? "Importing…" : "Import & reconcile"}
            </button>
          </div>
        </>
      )}

      {error && <div className="error-panel" style={{ marginTop: "0.75rem" }}>{error}</div>}
    </div>
  );
}

function ImportSummary({
  result,
  onContinue,
  onDiscard,
}: {
  result: MultiImportResult;
  onContinue: () => void;
  onDiscard: () => void;
}) {
  const { nettedPairs, crossGroupPairs, unmatched } = result.transfers;
  const deckSize = result.transactions.filter(
    (t) => t.transferState !== "netted",
  ).length;

  return (
    <div className="panel">
      <h2>Imported</h2>
      <div className="summary-grid">
        <Stat label="Transactions" value={result.transactions.length} />
        <Stat label="To categorize" value={deckSize} />
        <Stat label="Netted pairs" value={nettedPairs} hint="excluded" />
        <Stat label="Cross-group" value={crossGroupPairs} hint="kept" />
        <Stat label="Unmatched" value={unmatched} hint="review" />
        <Stat label="Row errors" value={result.errors.length} />
      </div>

      {result.errors.length > 0 && (
        <ul className="error" style={{ fontSize: "0.85rem" }}>
          {result.errors.map((e, i) => (
            <li key={`${e.accountId ?? "?"}-${e.row}-${i}`}>
              {e.accountId ?? "?"} row {e.row}: {e.message}
            </li>
          ))}
        </ul>
      )}

      <div className="row">
        <button className="btn btn-primary" onClick={onContinue}>
          Start categorizing →
        </button>
        <button className="btn btn-ghost" onClick={onDiscard}>
          Choose different files
        </button>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="stat">
      <div className="stat__value">{value}</div>
      <div className="stat__label">
        {label}
        {hint && <span className="stat__hint"> · {hint}</span>}
      </div>
    </div>
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
