import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { deleteRepayment } from "@/lib/db/reimbursements";

export const runtime = "nodejs";

/** DELETE /api/repayments/:id — unlink a repayment. Does not reopen a settled claim. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const claim = deleteRepayment(getDb(), id);
  if (!claim) {
    return NextResponse.json({ error: "Unknown repayment." }, { status: 404 });
  }
  return NextResponse.json({ claim });
}
