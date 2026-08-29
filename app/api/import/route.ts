import { NextResponse } from "next/server";
import {
  AccountsConfigError,
  accountMap,
  loadAccountsConfig,
} from "@/lib/accounts/config";
import { getDb } from "@/lib/db";
import { statusCounts, upsertTransactions } from "@/lib/db/transactions";
import { assignAccount } from "@/lib/transactions/assign";
import { CsvImportError, parseCsv } from "@/lib/transactions/parse";
import { reconcileTransfers } from "@/lib/transactions/reconcile";
import type {
  AccountTransaction,
  ImportRowError,
} from "@/lib/transactions/types";

// The pipeline uses node:crypto, the filesystem, and SQLite — needs Node.
export const runtime = "nodejs";

/**
 * POST /api/import
 *
 * Body: multipart form data with, in matching order, repeated `file` fields
 * (the CSVs) and repeated `accountId` fields (which account each file is).
 *
 * Parses, reconciles inter-account transfers, and upserts the result into the
 * database (existing rows — matched by content hash — are left untouched).
 */
export async function POST(request: Request): Promise<Response> {
  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json(
      { error: "Expected multipart form data." },
      { status: 400 },
    );
  }

  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  const accountIds = form.getAll("accountId").map(String);

  if (files.length === 0) {
    return NextResponse.json(
      { error: "Attach at least one CSV in the `file` field." },
      { status: 400 },
    );
  }
  if (accountIds.length !== files.length) {
    return NextResponse.json(
      { error: "Send one `accountId` per `file`, in the same order." },
      { status: 400 },
    );
  }

  let config;
  try {
    config = await loadAccountsConfig();
  } catch (err) {
    if (err instanceof AccountsConfigError) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    throw err;
  }

  const accounts = accountMap(config);
  const unknown = [...new Set(accountIds.filter((id) => !accounts.has(id)))];
  if (unknown.length > 0) {
    return NextResponse.json(
      { error: `Unknown account id(s): ${unknown.join(", ")}` },
      { status: 400 },
    );
  }

  const all: AccountTransaction[] = [];
  const errors: ImportRowError[] = [];

  try {
    for (let i = 0; i < files.length; i += 1) {
      const account = accounts.get(accountIds[i])!;
      const parsed = parseCsv(await files[i].text());
      all.push(...assignAccount(parsed.transactions, account));
      for (const err of parsed.errors) {
        errors.push({ ...err, accountId: account.id });
      }
    }
  } catch (err) {
    if (err instanceof CsvImportError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    throw err;
  }

  const { transactions, summary } = reconcileTransfers(all, config.accounts);

  const db = getDb();
  const { inserted, alreadyPresent } = upsertTransactions(
    db,
    transactions,
    new Date().toISOString(),
  );

  return NextResponse.json({
    batch: { total: transactions.length, inserted, alreadyPresent },
    transfers: summary,
    counts: statusCounts(db),
    errors,
  });
}
