import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  ClaimError,
  deleteClaim,
  getClaim,
  updateClaim,
} from "@/lib/db/reimbursements";
import { getTransaction } from "@/lib/db/transactions";

export const runtime = "nodejs";

/**
 * PATCH /api/claims/:id
 *
 * Body: any of `{ person, expected, note }` (edit the split), `{ status }`
 * (`open` | `settled` | `written_off`), `{ followedUp: boolean }`.
 * Returns the updated claim and its transaction.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const db = getDb();
  if (!getClaim(db, id)) {
    return NextResponse.json({ error: "Unknown claim." }, { status: 404 });
  }

  try {
    const claim = updateClaim(db, id, body)!;
    return NextResponse.json({
      claim,
      transaction: getTransaction(db, claim.txnId),
    });
  } catch (err) {
    if (err instanceof ClaimError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

/** DELETE /api/claims/:id — remove one claim. Returns its transaction. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const db = getDb();
  const existing = getClaim(db, id);
  if (!existing) {
    return NextResponse.json({ error: "Unknown claim." }, { status: 404 });
  }
  deleteClaim(db, id);
  return NextResponse.json({ transaction: getTransaction(db, existing.txnId) });
}
