import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getTransaction, setCategorization } from "@/lib/db/transactions";

export const runtime = "nodejs";

/**
 * PATCH /api/transactions/:id
 *
 * Body: `{ category, subcategory }` to categorize, or `{ status: "skipped" }`.
 * Returns the updated row.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  let body: { category?: unknown; subcategory?: unknown; status?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const db = getDb();
  if (!getTransaction(db, id)) {
    return NextResponse.json({ error: "Unknown transaction." }, { status: 404 });
  }

  if (body.status === "skipped") {
    return NextResponse.json(setCategorization(db, id, null));
  }

  if (
    typeof body.category === "string" &&
    body.category.length > 0 &&
    typeof body.subcategory === "string" &&
    body.subcategory.length > 0
  ) {
    return NextResponse.json(
      setCategorization(db, id, {
        category: body.category,
        subcategory: body.subcategory,
      }),
    );
  }

  return NextResponse.json(
    { error: 'Provide { category, subcategory } or { status: "skipped" }.' },
    { status: 400 },
  );
}
