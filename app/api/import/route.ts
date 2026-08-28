import { NextResponse } from "next/server";
import {
  AccountsConfigError,
  accountMap,
  loadAccountsConfig,
} from "@/lib/accounts/config";
import { assignAccount } from "@/lib/transactions/assign";
import { CsvImportError, parseCsv } from "@/lib/transactions/parse";
import { reconcileTransfers } from "@/lib/transactions/reconcile";
import type {
  AccountTransaction,
  ImportRowError,
  MultiImportResult,
} from "@/lib/transactions/types";

// The pipeline uses node:crypto and the filesystem, so this route needs Node.
export const runtime = "nodejs";

/**
 * POST /api/import
 *
 * Body: multipart form data with, in matching order, repeated `file` fields
 * (the CSVs) and repeated `accountId` fields (which account each file is).
 *
 * Response: `MultiImportResult` on success, `{ error }` otherwise.
 *
 * Parses and reconciles only — nothing is persisted yet.
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

  const result: MultiImportResult = {
    transactions,
    transfers: summary,
    errors,
  };
  return NextResponse.json(result);
}
