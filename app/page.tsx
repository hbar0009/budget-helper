"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import AppHeader from "@/components/AppHeader";
import CategorizeStage from "@/components/CategorizeStage";
import ImportStage from "@/components/ImportStage";
import ReviewStage from "@/components/ReviewStage";
import Stepper, { type Stage } from "@/components/Stepper";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { StoredTransaction } from "@/lib/db/transactions";
import type { CategorizationMap } from "@/lib/transactions/summary";

export default function HomePage() {
  const [transactions, setTransactions] = useState<StoredTransaction[] | null>(
    null,
  );
  const [stage, setStage] = useState<Stage>("import");
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<StoredTransaction[] | null> => {
    try {
      const res = await fetch("/api/transactions");
      if (!res.ok) throw new Error();
      const data = await res.json();
      const rows = data.transactions as StoredTransaction[];
      setTransactions(rows);
      return rows;
    } catch {
      setError("Could not load saved transactions.");
      setTransactions([]);
      return null;
    }
  }, []);

  // First load: pick the stage from what's already stored.
  useEffect(() => {
    load().then((rows) => {
      if (!rows) return;
      const deck = rows.filter((t) => t.transferState !== "netted");
      const firstPending = deck.findIndex((t) => t.status === "pending");
      if (firstPending >= 0) {
        setIndex(firstPending);
        setStage("categorize");
      } else if (deck.length > 0) {
        setStage("review");
      } else {
        setStage("import");
      }
    });
  }, [load]);

  const categorizations: CategorizationMap = useMemo(() => {
    const map: CategorizationMap = {};
    for (const t of transactions ?? []) {
      if (t.status === "categorized" && t.category && t.subcategory) {
        map[t.id] = { category: t.category, subcategory: t.subcategory };
      } else if (t.status === "skipped") {
        map[t.id] = null;
      }
    }
    return map;
  }, [transactions]);

  const categorize = useCallback(
    async (
      id: string,
      value: { category: string; subcategory: string } | null,
    ) => {
      // Optimistic: reflect the change immediately, reconcile with the server
      // response, and reload on failure.
      setTransactions((prev) =>
        (prev ?? []).map((t) =>
          t.id !== id
            ? t
            : value
              ? {
                  ...t,
                  status: "categorized",
                  category: value.category,
                  subcategory: value.subcategory,
                }
              : { ...t, status: "skipped", category: null, subcategory: null },
        ),
      );

      try {
        const res = await fetch(`/api/transactions/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(value ?? { status: "skipped" }),
        });
        if (!res.ok) throw new Error();
        const updated = (await res.json()) as StoredTransaction;
        setTransactions((prev) =>
          (prev ?? []).map((t) => (t.id === id ? updated : t)),
        );
      } catch {
        setError("A change didn't save — reloaded from the database.");
        await load();
      }
    },
    [load],
  );

  async function handleImported() {
    const rows = await load();
    const deck = (rows ?? []).filter((t) => t.transferState !== "netted");
    const firstPending = deck.findIndex((t) => t.status === "pending");
    setIndex(firstPending >= 0 ? firstPending : 0);
    setStage("categorize");
  }

  async function handleReset() {
    if (
      !window.confirm(
        "Delete every imported transaction and its categorization? This cannot be undone.",
      )
    ) {
      return;
    }
    await fetch("/api/transactions", { method: "DELETE" });
    setTransactions([]);
    setIndex(0);
    setStage("import");
  }

  const unlocked = (transactions?.length ?? 0) > 0;

  return (
    <>
      <AppHeader onReset={unlocked ? handleReset : undefined} />
      <main className="mx-auto max-w-3xl px-6 pt-7 pb-20">
        <Stepper
          stage={stage}
          unlocked={unlocked}
          onNavigate={(next) => unlocked && setStage(next)}
        />

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {transactions === null ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : stage === "import" ? (
          <ImportStage onImported={handleImported} />
        ) : stage === "categorize" ? (
          <CategorizeStage
            transactions={transactions}
            categorizations={categorizations}
            index={index}
            onIndexChange={setIndex}
            onCategorize={categorize}
            onComplete={() => setStage("review")}
          />
        ) : (
          <ReviewStage
            transactions={transactions}
            categorizations={categorizations}
            onBack={() => setStage("categorize")}
            onReset={handleReset}
          />
        )}
      </main>
    </>
  );
}
