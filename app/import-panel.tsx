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

const TRANSFER_LABEL: Record<ReconciledTransaction["transferState"], string> = {
  none: "",
  netted: "netted — excluded",
  cross_group: "cross-group — kept",
  unmatched: "unmatched — review",
};

/**
 * Harness for the multi-file import pipeline: pick all the statement CSVs,
 * say which account each one is, POST them, and see how the transfer
 * reconciliation classified everything. No categorization or saving yet.
 */
export default function ImportPanel() {
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
    return <p className="error">{accountsError}</p>;
  }

  const ready =
    assignments.length > 0 && assignments.every((a) => a.accountId !== "");

  return (
    <section>
      <p>
        <label>
          <strong>Statement CSVs (select all of them at once): </strong>
          <input
            type="file"
            accept=".csv,text/csv"
            multiple
            onChange={onFilesChosen}
            disabled={busy}
          />
        </label>
      </p>

      {assignments.length > 0 && (
        <>
          <table>
            <thead>
              <tr>
                <th>File</th>
                <th>Account</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a, i) => (
                <tr key={a.file.name}>
                  <td>{a.file.name}</td>
                  <td>
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p>
            <button onClick={submit} disabled={!ready || busy}>
              {busy ? "Importing…" : "Import"}
            </button>
          </p>
        </>
      )}

      {error && <p className="error">{error}</p>}
      {result && <Results result={result} accounts={accounts} />}
    </section>
  );
}

function Results({
  result,
  accounts,
}: {
  result: MultiImportResult;
  accounts: AccountOption[];
}) {
  const labelOf = (id: string) =>
    accounts.find((a) => a.id === id)?.label ?? id;
  const { nettedPairs, crossGroupPairs, unmatched } = result.transfers;
  const accountCount = new Set(result.transactions.map((t) => t.accountId)).size;

  return (
    <>
      <p>
        {result.transactions.length} transaction(s) across {accountCount}{" "}
        account(s). Transfers: {nettedPairs} netted pair(s) excluded,{" "}
        {crossGroupPairs} cross-group pair(s) kept, {unmatched} unmatched.
      </p>

      {result.errors.length > 0 && (
        <ul className="error">
          {result.errors.map((e, i) => (
            <li key={`${e.accountId ?? "?"}-${e.row}-${i}`}>
              {labelOf(e.accountId ?? "")} row {e.row}: {e.message}
            </li>
          ))}
        </ul>
      )}

      <table>
        <thead>
          <tr>
            <th>Account</th>
            <th>Date</th>
            <th>Description</th>
            <th className="num">Amount</th>
            <th>Transfer</th>
          </tr>
        </thead>
        <tbody>
          {result.transactions.map((t) => (
            <tr
              key={t.id}
              className={t.transferState === "netted" ? "muted" : undefined}
            >
              <td>{labelOf(t.accountId)}</td>
              <td>{t.date}</td>
              <td>{t.description}</td>
              <td className="num">{t.amount.toFixed(2)}</td>
              <td>{TRANSFER_LABEL[t.transferState]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/**
 * Best-effort pre-selection: pick the account whose label words all appear in
 * the filename. Won't disambiguate every case — the dropdown is the source of
 * truth.
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
