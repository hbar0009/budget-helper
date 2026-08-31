"use client";

import { useEffect, useState } from "react";

import AnalysisView from "@/components/AnalysisView";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { StoredTransaction } from "@/lib/db/transactions";

export default function AnalysisPage() {
  const [transactions, setTransactions] = useState<StoredTransaction[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/transactions")
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!cancelled) setTransactions(data.transactions as StoredTransaction[]);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Could not load transactions.");
          setTransactions([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-6 pt-7 pb-20">
      <h1 className="mb-5 text-lg font-semibold tracking-tight">Analysis</h1>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {transactions === null ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : (
        <AnalysisView transactions={transactions} />
      )}
    </main>
  );
}
