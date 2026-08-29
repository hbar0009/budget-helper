import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  deleteAllTransactions,
  listTransactions,
  statusCounts,
  type TxnStatus,
} from "@/lib/db/transactions";

export const runtime = "nodejs";

const STATUSES: TxnStatus[] = [
  "pending",
  "categorized",
  "skipped",
  "excluded",
];

/**
 * GET /api/transactions[?status=pending]
 *
 * Returns every stored transaction (optionally filtered by status) plus the
 * per-status counts. The client derives its stage and deck from this.
 */
export async function GET(request: Request): Promise<Response> {
  const status = new URL(request.url).searchParams.get("status");
  const filter = STATUSES.includes(status as TxnStatus)
    ? { status: status as TxnStatus }
    : undefined;

  const db = getDb();
  return NextResponse.json({
    transactions: listTransactions(db, filter),
    counts: statusCounts(db),
  });
}

/** DELETE /api/transactions — wipe everything (the "start over" escape hatch). */
export async function DELETE(): Promise<Response> {
  deleteAllTransactions(getDb());
  return NextResponse.json({ ok: true });
}
