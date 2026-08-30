import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { FlagError, addFlag, isFlagKind } from "@/lib/db/flags";
import { getTransaction } from "@/lib/db/transactions";

export const runtime = "nodejs";

/**
 * POST /api/transactions/:id/flags
 *
 * Body: `{ kind: "wrong_account" | "note", data: {...} }`. Returns the new flag
 * and the transaction it now hangs off (with its full flag list).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  let body: { kind?: unknown; data?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  if (!isFlagKind(body.kind)) {
    return NextResponse.json(
      { error: 'kind must be "wrong_account" or "note".' },
      { status: 400 },
    );
  }

  const db = getDb();
  try {
    const flag = addFlag(db, id, body.kind, body.data);
    return NextResponse.json({ flag, transaction: getTransaction(db, id) });
  } catch (err) {
    if (err instanceof FlagError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
