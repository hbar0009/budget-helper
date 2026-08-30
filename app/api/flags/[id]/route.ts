import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  FlagError,
  deleteFlag,
  getFlag,
  reopenFlag,
  resolveFlag,
  updateFlagData,
} from "@/lib/db/flags";
import { getTransaction } from "@/lib/db/transactions";

export const runtime = "nodejs";

/**
 * PATCH /api/flags/:id
 *
 * Body: any of `{ data }` (replace the kind-specific payload),
 * `{ status: "resolved", correctedByTxnId? }`, `{ status: "open" }`.
 * Returns the updated flag and its transaction.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  let body: { data?: unknown; status?: unknown; correctedByTxnId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const db = getDb();
  if (!getFlag(db, id)) {
    return NextResponse.json({ error: "Unknown flag." }, { status: 404 });
  }

  try {
    let flag = getFlag(db, id)!;
    if (body.data !== undefined) flag = updateFlagData(db, id, body.data)!;
    if (body.status === "resolved") {
      const correctedByTxnId =
        typeof body.correctedByTxnId === "string"
          ? body.correctedByTxnId
          : undefined;
      flag = resolveFlag(db, id, { correctedByTxnId })!;
    } else if (body.status === "open") {
      flag = reopenFlag(db, id)!;
    }
    return NextResponse.json({
      flag,
      transaction: getTransaction(db, flag.txnId),
    });
  } catch (err) {
    if (err instanceof FlagError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

/** DELETE /api/flags/:id — remove a flag. Returns its (now un-flagged) transaction. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const db = getDb();
  const existing = getFlag(db, id);
  if (!existing) {
    return NextResponse.json({ error: "Unknown flag." }, { status: 404 });
  }
  deleteFlag(db, id);
  return NextResponse.json({ transaction: getTransaction(db, existing.txnId) });
}
