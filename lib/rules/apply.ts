/**
 * Apply auto-categorization rules to transactions. Pure and unit-tested.
 *
 * First matching rule wins (rules are ordered most- to least-important in the
 * config). Netted transfers are never matched.
 */

import type { ReconciledTransaction } from "../transactions/types.ts";
import type { Rule } from "./config.ts";

export interface RuleMatch {
  transactionId: string;
  ruleIndex: number;
  label: string;
  category: string;
  subcategory: string;
}

function compile(rule: Rule): (t: ReconciledTransaction) => boolean {
  const textMatches: (description: string) => boolean = rule.regex
    ? ((re) => (description: string) => re.test(description))(
        new RegExp(rule.regex, "i"),
      )
    : ((needle) => (description: string) =>
        description.toLowerCase().includes(needle))(
        (rule.contains ?? "").toLowerCase(),
      );

  return (t) => {
    if (!textMatches(t.description)) return false;
    if (rule.direction && t.direction !== rule.direction) return false;
    if (rule.account && t.accountId !== rule.account) return false;
    const magnitude = Math.abs(t.amount);
    if (rule.minAmount !== undefined && magnitude < rule.minAmount) return false;
    if (rule.maxAmount !== undefined && magnitude > rule.maxAmount) return false;
    return true;
  };
}

export function applyRules(
  transactions: ReconciledTransaction[],
  rules: Rule[],
): RuleMatch[] {
  const compiled = rules.map((rule, index) => ({
    rule,
    index,
    matches: compile(rule),
  }));

  const results: RuleMatch[] = [];
  for (const t of transactions) {
    if (t.transferState === "netted") continue;
    const hit = compiled.find((c) => c.matches(t));
    if (!hit) continue;
    results.push({
      transactionId: t.id,
      ruleIndex: hit.index,
      label: hit.rule.label ?? hit.rule.contains ?? hit.rule.regex ?? "rule",
      category: hit.rule.category,
      subcategory: hit.rule.subcategory,
    });
  }
  return results;
}
