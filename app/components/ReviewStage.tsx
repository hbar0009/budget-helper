"use client";

import { Fragment, useMemo } from "react";
import {
  budgetDeck,
  buildReviewSummary,
  type CategorizationMap,
} from "@/lib/transactions/summary";
import type { ReconciledTransaction } from "@/lib/transactions/types";

interface Props {
  transactions: ReconciledTransaction[];
  categorizations: CategorizationMap;
  onBack: () => void;
  onReset: () => void;
}

export default function ReviewStage({
  transactions,
  categorizations,
  onBack,
  onReset,
}: Props) {
  const summary = useMemo(
    () => buildReviewSummary(transactions, categorizations),
    [transactions, categorizations],
  );

  function downloadCsv() {
    const rows = budgetDeck(transactions).map((t) => {
      const entry = categorizations[t.id];
      return [
        t.date,
        t.group,
        t.accountId,
        t.description,
        t.amount.toFixed(2),
        entry === undefined ? "PENDING" : entry === null ? "SKIPPED" : entry.category,
        entry && entry !== null ? entry.subcategory : "",
        t.transferState,
      ];
    });
    const header = [
      "date",
      "group",
      "account",
      "description",
      "amount",
      "category",
      "subcategory",
      "transfer_state",
    ];
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "categorized-transactions.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="review">
      <div className="stat-grid">
        <Stat label="In deck" value={summary.total} />
        <Stat label="Categorized" value={summary.categorized} />
        <Stat label="Skipped" value={summary.skipped} />
        <Stat label="Pending" value={summary.pending} />
        <Stat label="Netted transfers" value={summary.nettedExcluded} hint="excluded" />
        <Stat label="Cross-group" value={summary.crossGroupKept} hint="kept" />
      </div>

      {summary.groups.map((group) => (
        <section className="panel" key={group.group}>
          <div className="review__group-head">
            <h2 className="capitalize">{group.group}</h2>
            <span className={`amount ${group.net < 0 ? "is-out" : "is-in"}`}>
              {formatSigned(group.net)}
            </span>
          </div>
          <table className="table">
            <tbody>
              {group.categories.map((category) => (
                <Fragment key={category.category}>
                  <tr className="review__cat-row">
                    <td>{category.category}</td>
                    <td className="num muted">{category.count}</td>
                    <td
                      className={`num amount ${category.net < 0 ? "is-out" : "is-in"}`}
                    >
                      {formatSigned(category.net)}
                    </td>
                  </tr>
                  {category.subcategories.map((sub) => (
                    <tr className="review__sub-row" key={sub.subcategory}>
                      <td className="review__sub-name">{sub.subcategory}</td>
                      <td className="num">{sub.count}</td>
                      <td className="num">{formatSigned(sub.net)}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      {summary.groups.length === 0 && (
        <div className="panel muted">Nothing categorized yet.</div>
      )}

      {summary.skippedTransactions.length > 0 && (
        <section className="panel">
          <h2>Skipped ({summary.skippedTransactions.length})</h2>
          <p className="muted">Nothing was recorded for these.</p>
          <table className="table">
            <tbody>
              {summary.skippedTransactions.map((t) => (
                <tr key={t.id}>
                  <td>{t.date}</td>
                  <td>{t.description}</td>
                  <td className="num">{t.amount.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <div className="review__actions">
        <button className="btn btn-ghost" onClick={onBack}>
          ← Back to cards
        </button>
        <div className="row">
          <button className="btn btn-ghost" onClick={downloadCsv}>
            Download CSV
          </button>
          <button
            className="btn btn-primary"
            disabled
            title="Sheet sync is the next feature"
          >
            Sync to Google Sheets
          </button>
        </div>
      </div>
      <p className="muted review__note">
        CSV export is a stopgap. Writing to Google Sheets / Excel via the
        per-group <code>sink</code> is the next feature. Progress is saved in this
        browser until then.
      </p>

      <p className="review__note">
        <button className="btn btn-ghost btn-sm" onClick={onReset}>
          Start over
        </button>
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="stat">
      <div className="stat__value">{value}</div>
      <div className="stat__label">
        {label}
        {hint && <span className="stat__hint"> · {hint}</span>}
      </div>
    </div>
  );
}

function formatSigned(n: number): string {
  return `${n < 0 ? "−" : "+"}$${Math.abs(n).toFixed(2)}`;
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
