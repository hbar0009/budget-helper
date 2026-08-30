"use client";

import { useEffect, useState } from "react";

export interface AccountLite {
  id: string;
  label: string;
  type: string;
  group: string;
  /** Money is paid out of this account (server-resolved from `Account.spending`). */
  spending: boolean;
}

/** Loads the account list from `/api/accounts` (no numbers / sink config). */
export function useAccounts(): {
  accounts: AccountLite[] | null;
  error: string | null;
} {
  const [accounts, setAccounts] = useState<AccountLite[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/accounts")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load accounts.");
        if (!cancelled) setAccounts(data.accounts as AccountLite[]);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { accounts, error };
}
