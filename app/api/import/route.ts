import { NextResponse } from "next/server";
import {
  AccountsConfigError,
  accountMap,
  loadAccountsConfig,
} from "@/lib/accounts/config";
import {
  CategoriesConfigError,
  loadCategoriesConfig,
} from "@/lib/categories/config";
import { getDb } from "@/lib/db";
import { statusCounts, upsertTransactions } from "@/lib/db/transactions";
import {
  RulesConfigError,
  loadRulesConfig,
  validateRulesAgainstCategories,
} from "@/lib/rules/config";
import { runRulesOverPending } from "@/lib/rules/run";
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

  // Auto-categorization. A broken or missing rules file never blocks an import.
  let autoCategorized = 0;
  let ruleWarnings: string[] = [];
  try {
    const { rules } = await loadRulesConfig();
    if (rules.length > 0) {
      const categories = await loadCategoriesConfig();
      const { valid, warnings } = validateRulesAgainstCategories(
        rules,
        categories,
      );
      ruleWarnings = warnings;
      autoCategorized = runRulesOverPending(db, valid).matched;
    }
  } catch (err) {
    if (err instanceof RulesConfigError || err instanceof CategoriesConfigError) {
      ruleWarnings = [err.message];
    } else {
      throw err;
    }
  }

  return NextResponse.json({
    batch: { total: transactions.length, inserted, alreadyPresent },
    transfers: summary,
    counts: statusCounts(db),
    autoCategorized,
    ruleWarnings,
    errors,
  });
}
