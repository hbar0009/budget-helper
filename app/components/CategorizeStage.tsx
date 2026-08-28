"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCategories } from "../hooks/useCategories";
import {
  budgetDeck,
  type CategorizationMap,
} from "@/lib/transactions/summary";
import type { ReconciledTransaction } from "@/lib/transactions/types";
import CategoryPicker from "./CategoryPicker";
import TransactionCard from "./TransactionCard";

interface Props {
  transactions: ReconciledTransaction[];
  categorizations: CategorizationMap;
  index: number;
  onIndexChange: (index: number) => void;
  onCategorize: (
    id: string,
    value: { category: string; subcategory: string } | null,
  ) => void;
  onComplete: () => void;
}

export default function CategorizeStage({
  transactions,
  categorizations,
  index,
  onIndexChange,
  onCategorize,
  onComplete,
}: Props) {
  const { categories, error } = useCategories();
  const deck = useMemo(() => budgetDeck(transactions), [transactions]);

  const [step, setStep] = useState<"category" | "subcategory">("category");
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);

  const current: ReconciledTransaction | undefined = deck[index];
  const existing = current ? categorizations[current.id] : undefined;

  // Landing on a card: seed the picker from any categorization it already has.
  useEffect(() => {
    if (existing) {
      setPendingCategory(existing.category);
      setStep("subcategory");
    } else {
      setPendingCategory(null);
      setStep("category");
    }
    // Re-run whenever we move to a different card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, current?.id]);

  const goto = useCallback(
    (next: number) => {
      onIndexChange(Math.max(0, Math.min(deck.length, next)));
    },
    [deck.length, onIndexChange],
  );

  const skip = useCallback(() => {
    if (!current) return;
    onCategorize(current.id, null);
    goto(index + 1);
  }, [current, onCategorize, goto, index]);

  const pickSubcategory = useCallback(
    (subcategory: string) => {
      if (!current || !pendingCategory) return;
      onCategorize(current.id, { category: pendingCategory, subcategory });
      goto(index + 1);
    },
    [current, pendingCategory, onCategorize, goto, index],
  );

  const changeCategory = useCallback(() => {
    setStep("category");
    setPendingCategory(null);
  }, []);

  // Alt chords: don't collide with typing in the picker's search box.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.altKey) return;
      if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        skip();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goto(index - 1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goto(index + 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [skip, goto, index]);

  if (error) {
    return <div className="error-panel">{error}</div>;
  }
  if (!categories) {
    return <div className="panel muted">Loading categories…</div>;
  }
  if (deck.length === 0) {
    return (
      <div className="panel deck-done">
        <h2>Nothing to categorize</h2>
        <p className="muted">
          Every imported transaction was a netted transfer.
        </p>
        <button className="btn btn-primary" onClick={onComplete}>
          Go to review →
        </button>
      </div>
    );
  }

  const handledCount = deck.filter(
    (t) => categorizations[t.id] !== undefined,
  ).length;

  if (index >= deck.length) {
    return (
      <div className="panel deck-done">
        <h2>Deck complete</h2>
        <p className="muted">
          {handledCount} of {deck.length} transactions handled.
        </p>
        <div className="row">
          <button
            className="btn btn-ghost"
            onClick={() => goto(deck.length - 1)}
          >
            Back to last card
          </button>
          <button className="btn btn-primary" onClick={onComplete}>
            Review results →
          </button>
        </div>
      </div>
    );
  }

  const categoryNames = categories.map((c) => c.name);
  const subcategoryNames =
    categories.find((c) => c.name === pendingCategory)?.subcategories ?? [];

  return (
    <div className="categorize">
      <div className="categorize__progress">
        <div className="progress">
          <div
            className="progress__bar"
            style={{ width: `${(handledCount / deck.length) * 100}%` }}
          />
        </div>
        <div className="categorize__count">
          <strong>{index + 1}</strong> / {deck.length}
          <span className="muted"> · {handledCount} done</span>
        </div>
      </div>

      <TransactionCard transaction={current!} />

      <div className="picker-wrap">
        {step === "category" ? (
          <CategoryPicker
            key={`cat-${current!.id}`}
            label="Category"
            options={categoryNames}
            value={pendingCategory}
            onPick={(category) => {
              setPendingCategory(category);
              setStep("subcategory");
            }}
          />
        ) : (
          <>
            <button
              className="btn btn-ghost btn-sm picker-back"
              onClick={changeCategory}
            >
              ← {pendingCategory}
            </button>
            <CategoryPicker
              key={`sub-${current!.id}-${pendingCategory}`}
              label="Subcategory"
              options={subcategoryNames}
              value={existing?.subcategory ?? null}
              onPick={pickSubcategory}
              onEscape={changeCategory}
            />
          </>
        )}
      </div>

      <div className="categorize__controls">
        <button
          className="btn btn-ghost"
          onClick={() => goto(index - 1)}
          disabled={index === 0}
        >
          Back
        </button>
        <div className="row">
          <span className="kbd-hint muted">⌥S skip · ⌥← ⌥→ move</span>
          <button className="btn btn-ghost" onClick={skip}>
            Skip
          </button>
          <button className="btn btn-ghost" onClick={onComplete}>
            Finish →
          </button>
        </div>
      </div>
    </div>
  );
}
