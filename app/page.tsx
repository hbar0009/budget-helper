"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import AppHeader from "@/components/AppHeader";
import AutoReviewStage from "@/components/AutoReviewStage";
import CategorizeStage from "@/components/CategorizeStage";
import ImportStage from "@/components/ImportStage";
import ReviewStage from "@/components/ReviewStage";
import Stepper, { type Stage } from "@/components/Stepper";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { StoredTransaction } from "@/lib/db/transactions";
import type { CategorizationMap } from "@/lib/transactions/summary";

/**
 * The manual categorize deck: budget-relevant rows the user still handles by
 * hand. Netted transfers never count; neither do rows a rule already
 * categorized and the user left approved in auto-review — those are done.
 */
const inCategorizeDeck = (t: StoredTransaction): boolean =>
  t.transferState !== "netted" && t.categorizedBy !== "rule";

export default function HomePage() {
  const [transactions, setTransactions] = useState<StoredTransaction[] | null>(
    null,
  );
  const [stage, setStage] = useState<Stage>("import");
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

  const firstPendingDeckIndex = (rows: StoredTransaction[]): number => {
    const deck = rows.filter(inCategorizeDeck);
    const at = deck.findIndex((t) => t.status === "pending");
    return at >= 0 ? at : 0;
  };

  // First load: pick the stage from what's already stored.
  useEffect(() => {
    load().then((rows) => {
      if (!rows) return;
      const relevant = rows.filter((t) => t.transferState !== "netted");
      if (relevant.filter(inCategorizeDeck).some((t) => t.status === "pending")) {
        setIndex(firstPendingDeckIndex(rows));
        setStage("categorize");
      } else if (relevant.length > 0) {
        setStage("review");
      } else {
        setStage("import");
      }
    });
  }, [load]);

  const hasAutoCategorized = (transactions ?? []).some(
    (t) => t.categorizedBy === "rule",
  );

  const stages: Stage[] = hasAutoCategorized
    ? ["import", "autoReview", "categorize", "review"]
    : ["import", "categorize", "review"];

  // If every auto-categorized row gets undone while we're on that screen, move on.
  useEffect(() => {
    if (stage === "autoReview" && transactions && !hasAutoCategorized) {
      setStage("categorize");
    }
  }, [stage, transactions, hasAutoCategorized]);

  // The "re-ran rules" banner belongs to auto-review — clear it on the way out.
  useEffect(() => {
    if (stage !== "autoReview") setNotice(null);
  }, [stage]);

  const categorizeDeck = useMemo(
    () => (transactions ?? []).filter(inCategorizeDeck),
    [transactions],
  );

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

  const patch = useCallback(
    async (id: string, body: Record<string, unknown>, optimistic: StoredTransaction) => {
      setTransactions((prev) =>
        (prev ?? []).map((t) => (t.id === id ? optimistic : t)),
      );
      try {
        const res = await fetch(`/api/transactions/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
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

  const categorize = useCallback(
    (id: string, value: { category: string; subcategory: string } | null) => {
      const current = (transactions ?? []).find((t) => t.id === id);
      if (!current) return;
      const optimistic: StoredTransaction = value
        ? {
            ...current,
            status: "categorized",
            category: value.category,
            subcategory: value.subcategory,
            categorizedBy: "manual",
            ruleLabel: null,
          }
        : {
            ...current,
            status: "skipped",
            category: null,
            subcategory: null,
            categorizedBy: null,
            ruleLabel: null,
          };
      void patch(id, value ?? { status: "skipped" }, optimistic);
    },
    [transactions, patch],
  );

  const undo = useCallback(
    (id: string) => {
      const current = (transactions ?? []).find((t) => t.id === id);
      if (!current) return;
      void patch(
        id,
        { status: "pending" },
        {
          ...current,
          status: "pending",
          category: null,
          subcategory: null,
          categorizedBy: null,
          ruleLabel: null,
        },
      );
    },
    [transactions, patch],
  );

  async function handleImported() {
    const rows = await load();
    if (!rows) return;
    if (rows.some((t) => t.categorizedBy === "rule")) {
      setStage("autoReview");
    } else {
      setIndex(firstPendingDeckIndex(rows));
      setStage("categorize");
    }
  }

  async function handleRerun() {
    setNotice(null);
    try {
      const res = await fetch("/api/rules/apply", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not re-run rules.");
        return;
      }
      await load();
      setNotice(
        `Re-ran rules — ${data.matched} newly matched${
          data.warnings?.length ? `, ${data.warnings.length} warning(s)` : ""
        }.`,
      );
    } catch {
      setError("Could not re-run rules.");
    }
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
    setNotice(null);
    setStage("import");
  }

  const unlocked = (transactions?.length ?? 0) > 0;

  return (
    <>
      <AppHeader onReset={unlocked ? handleReset : undefined} />
      <main className="mx-auto max-w-3xl px-6 pt-7 pb-20">
        <Stepper
          stage={stage}
          stages={stages}
          unlocked={unlocked}
          onNavigate={(next) => unlocked && setStage(next)}
        />

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {notice && (
          <Alert className="mb-4">
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}

        {transactions === null ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : stage === "import" ? (
          <ImportStage onImported={handleImported} />
        ) : stage === "autoReview" ? (
          <AutoReviewStage
            transactions={transactions}
            onUndo={undo}
            onRerun={handleRerun}
            onContinue={() => {
              if (categorizeDeck.length === 0) {
                setStage("review");
              } else {
                setIndex(firstPendingDeckIndex(transactions));
                setStage("categorize");
              }
            }}
          />
        ) : stage === "categorize" ? (
          <CategorizeStage
            transactions={categorizeDeck}
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
