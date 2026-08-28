"use client";

import { useEffect, useState } from "react";
import AppHeader from "./components/AppHeader";
import CategorizeStage from "./components/CategorizeStage";
import ImportStage from "./components/ImportStage";
import ReviewStage from "./components/ReviewStage";
import Stepper from "./components/Stepper";
import {
  clearSession,
  loadSession,
  saveSession,
  type Stage,
} from "./lib/session";
import type { CategorizationMap } from "@/lib/transactions/summary";
import type { ReconciledTransaction } from "@/lib/transactions/types";

export default function HomePage() {
  const [restored, setRestored] = useState(false);
  const [stage, setStage] = useState<Stage>("import");
  const [transactions, setTransactions] = useState<ReconciledTransaction[]>([]);
  const [categorizations, setCategorizations] = useState<CategorizationMap>({});
  const [index, setIndex] = useState(0);

  // Restore an in-progress session on first mount.
  useEffect(() => {
    const session = loadSession();
    if (session) {
      setStage(session.stage);
      setTransactions(session.transactions);
      setCategorizations(session.categorizations);
      setIndex(session.index ?? 0);
    }
    setRestored(true);
  }, []);

  // Persist after every change (once restore has run, so we don't clobber it).
  useEffect(() => {
    if (!restored || transactions.length === 0) return;
    saveSession({ transactions, categorizations, stage, index });
  }, [restored, transactions, categorizations, stage, index]);

  const unlocked = transactions.length > 0;

  function handleImported(imported: ReconciledTransaction[]) {
    setTransactions(imported);
    setCategorizations({});
    setIndex(0);
    setStage("categorize");
  }

  function handleReset() {
    clearSession();
    setTransactions([]);
    setCategorizations({});
    setIndex(0);
    setStage("import");
  }

  return (
    <>
      <AppHeader onReset={unlocked ? handleReset : undefined} />
      <main className="app-main">
        <Stepper
          stage={stage}
          unlocked={unlocked}
          onNavigate={(next) => unlocked && setStage(next)}
        />

        {stage === "import" && <ImportStage onImported={handleImported} />}

        {stage === "categorize" && (
          <CategorizeStage
            transactions={transactions}
            categorizations={categorizations}
            index={index}
            onIndexChange={setIndex}
            onCategorize={(id, value) =>
              setCategorizations((prev) => ({ ...prev, [id]: value }))
            }
            onComplete={() => setStage("review")}
          />
        )}

        {stage === "review" && (
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
