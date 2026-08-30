import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ClaimError, addRepayment } from "@/lib/db/reimbursements";

export const runtime = "nodejs";

/**
 * POST /api/claims/:id/repayments
 *
 * Body: `{ txnId: string | null, amount: number }` — link an incoming credit
 * (or record a cash repayment with `txnId: null`) against this claim. Returns
 * the updated claim; the client reloads (two transactions can be affected).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  try {
    const claim = addRepayment(getDb(), id, body);
    return NextResponse.json({ claim });
  } catch (err) {
    if (err instanceof ClaimError) {
      const unknown = err.message.startsWith("Unknown claim");
      return NextResponse.json(
        { error: err.message },
        { status: unknown ? 404 : 400 },
      );
    }
    throw err;
  }
}
