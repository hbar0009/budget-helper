import { NextResponse } from "next/server";
import { AccountsConfigError, loadAccountsConfig } from "@/lib/accounts/config";
import { getDb } from "@/lib/db";
import { listTransactions } from "@/lib/db/transactions";
import { SinkError, buildSinkRowsByGroup, sinkFor } from "@/lib/sink";

export const runtime = "nodejs";

/**
 * POST /api/sink/push — write every group's categorized rows to its configured
 * sink (spreadsheet). Idempotent: rows are matched by transaction id, so a
 * re-push updates changed rows in place and adds new ones, never duplicating.
 *
 * Each group is pushed independently; one group failing still reports the
 * others. Response: `{ results: [{ group, rows, added, updated, unchanged }
 * | { group, rows, error }] }`.
 */
export async function POST(): Promise<Response> {
  let config;
  try {
    config = await loadAccountsConfig();
  } catch (err) {
    if (err instanceof AccountsConfigError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  const rowsByGroup = buildSinkRowsByGroup(
    listTransactions(getDb()),
    config.accounts,
  );

  const results = [];
  for (const group of Object.keys(config.groups)) {
    const rows = rowsByGroup[group] ?? [];
    if (rows.length === 0) {
      results.push({ group, rows: 0, added: 0, updated: 0, unchanged: 0 });
      continue;
    }
    try {
      const result = await sinkFor(config.groups[group].sink).push(rows);
      results.push({ group, rows: rows.length, ...result });
    } catch (err) {
      if (err instanceof SinkError || err instanceof Error) {
        results.push({ group, rows: rows.length, error: err.message });
      } else {
        throw err;
      }
    }
  }

  return NextResponse.json({ results });
}
