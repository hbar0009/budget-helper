"use client";

import type { ReconciledTransaction } from "@/lib/transactions/types";

export default function TransactionCard({
  transaction,
}: {
  transaction: ReconciledTransaction;
}) {
  const out = transaction.amount < 0;
  const [merchant, ...rest] = transaction.description.split(" - ");

  return (
    <article className="txn-card">
      <div className="txn-card__top">
        <span className={`badge badge--${transaction.group}`}>
          {transaction.group}
        </span>
        {transaction.transferState === "cross_group" && (
          <span className="badge badge--info">cross-group transfer</span>
        )}
        {transaction.transferState === "unmatched" && (
          <span className="badge badge--warn">unmatched transfer</span>
        )}
        <span className="txn-card__date">{formatDate(transaction.date)}</span>
      </div>

      <div className={`txn-card__amount ${out ? "is-out" : "is-in"}`}>
        {out ? "−" : "+"}${Math.abs(transaction.amount).toFixed(2)}
      </div>

      <div className="txn-card__desc">
        <span className="txn-card__merchant">{merchant}</span>
        {rest.length > 0 && (
          <span className="txn-card__detail">{rest.join(" · ")}</span>
        )}
      </div>
    </article>
  );
}

function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
