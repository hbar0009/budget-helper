"use client";

import type { Stage } from "../lib/session";

const STEPS: { key: Stage; label: string }[] = [
  { key: "import", label: "Import" },
  { key: "categorize", label: "Categorize" },
  { key: "review", label: "Review" },
];

interface Props {
  stage: Stage;
  /** True once transactions have been imported (steps 2 and 3 become reachable). */
  unlocked: boolean;
  onNavigate: (stage: Stage) => void;
}

export default function Stepper({ stage, unlocked, onNavigate }: Props) {
  const activeIndex = STEPS.findIndex((s) => s.key === stage);

  return (
    <nav className="stepper" aria-label="Progress">
      {STEPS.map((step, i) => {
        const state =
          i === activeIndex ? "active" : i < activeIndex ? "done" : "upcoming";
        const clickable = unlocked && step.key !== "import" && i !== activeIndex;

        return (
          <button
            key={step.key}
            type="button"
            className={`stepper__step stepper__step--${state}`}
            aria-current={i === activeIndex ? "step" : undefined}
            disabled={!clickable}
            onClick={() => clickable && onNavigate(step.key)}
          >
            <span className="stepper__num">{i + 1}</span>
            <span>{step.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
