import { NextResponse } from "next/server";
import {
  CategoriesConfigError,
  loadCategoriesConfig,
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
