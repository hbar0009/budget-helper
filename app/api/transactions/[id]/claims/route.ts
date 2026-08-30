import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ClaimError, addClaims } from "@/lib/db/reimbursements";
import { getTransaction } from "@/lib/db/transactions";

export const runtime = "nodejs";

/**
 * POST /api/transactions/:id/claims
 *
 * Body: `{ claims: [{ person, expected?, note? }, ...] }` — one entry per person
 * who owes a share of this fronted debit. Returns the created claims and the
 * transaction with its full claim list.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  let body: { claims?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const db = getDb();
  try {
    const claims = addClaims(db, id, (body.claims ?? []) as unknown[]);
    return NextResponse.json({ claims, transaction: getTransaction(db, id) });
  } catch (err) {
    if (err instanceof ClaimError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
