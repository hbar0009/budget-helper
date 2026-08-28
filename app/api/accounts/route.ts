import { NextResponse } from "next/server";
import { AccountsConfigError, loadAccountsConfig } from "@/lib/accounts/config";

export const runtime = "nodejs";

/**
 * GET /api/accounts
 *
 * The account list for the upload UI's dropdowns. Deliberately omits account
 * numbers and sink config — the browser doesn't need them.
 */
export async function GET(): Promise<Response> {
  try {
    const config = await loadAccountsConfig();
    return NextResponse.json({
      accounts: config.accounts.map(({ id, label, type, group }) => ({
        id,
        label,
        type,
        group,
      })),
    });
  } catch (err) {
    if (err instanceof AccountsConfigError) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    throw err;
  }
}
