import { NextResponse } from "next/server";
import {
  CategoriesConfigError,
  addToCategories,
  loadCategoriesConfig,
  writeCategoriesConfig,
} from "@/lib/categories/config";

export const runtime = "nodejs";

/** GET /api/categories — the category / subcategory taxonomy for the review card. */
export async function GET(): Promise<Response> {
  try {
    return NextResponse.json(await loadCategoriesConfig());
  } catch (err) {
    if (err instanceof CategoriesConfigError) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    throw err;
  }
}

/**
 * POST /api/categories — add a category and/or subcategory mid-flow.
 *
 * Body: `{ category: string, subcategory?: string }`. A brand-new category must
 * come with a subcategory. Writes the result back to `config/categories.json`
 * and returns the updated `{ categories }`.
 */
export async function POST(request: Request): Promise<Response> {
  let body: { category?: unknown; subcategory?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const category = typeof body.category === "string" ? body.category : "";
  const subcategory =
    typeof body.subcategory === "string" ? body.subcategory : undefined;

  try {
    const current = await loadCategoriesConfig();
    const next = addToCategories(current, { category, subcategory });
    await writeCategoriesConfig(next);
    return NextResponse.json({ categories: next.categories });
  } catch (err) {
    if (err instanceof CategoriesConfigError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
