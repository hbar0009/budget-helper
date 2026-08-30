import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ClaimError, addRepayment } from "@/lib/db/reimbursements";

export const runtime = "nodejs";

/**
 * POST /api/transactions/:id/repayments
 *
 * Split one incoming credit across several claims at once.
 * Body: `{ repayments: [{ claimId, amount }, ...] }`. Every repayment is funded
 * by transaction `:id`. Applied in a single db transaction. The client reloads.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  let body: { repayments?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const rows = Array.isArray(body.repayments) ? body.repayments : [];
  if (rows.length === 0) {
    return NextResponse.json(
      { error: "Pick at least one person." },
      { status: 400 },
    );
  }

  const db = getDb();
  try {
    const apply = db.transaction(() => {
      for (const row of rows) {
        const r = (row ?? {}) as Record<string, unknown>;
        addRepayment(db, String(r.claimId ?? ""), {
          txnId: id,
          amount: r.amount,
        });
      }
    });
    apply();
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ClaimError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
