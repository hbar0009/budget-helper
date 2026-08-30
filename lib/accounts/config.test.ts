import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type Account,
  AccountsConfigError,
  isSpendingAccount,
  parseAccountsConfig,
} from "./config.ts";

function acct(partial: Partial<Account> = {}): Account {
  return {
    id: "p-e",
    label: "Personal Everyday",
    number: "1",
    type: "everyday",
    group: "personal",
    ...partial,
  };
}

const VALID = JSON.stringify({
  accounts: [acct(), acct({ id: "p-s", type: "savings" })],
  groups: { personal: { sink: { kind: "google-sheets" } } },
});

test("parseAccountsConfig accepts a well-formed file", () => {
  assert.equal(parseAccountsConfig(VALID).accounts.length, 2);
});

test("parseAccountsConfig rejects a non-boolean `spending`", () => {
  const raw = JSON.stringify({
    accounts: [{ ...acct(), spending: "yes" }],
    groups: { personal: { sink: { kind: "google-sheets" } } },
  });
  assert.throws(() => parseAccountsConfig(raw), AccountsConfigError);
});

test("isSpendingAccount uses the explicit flag when set", () => {
  assert.equal(isSpendingAccount(acct({ type: "savings", spending: true })), true);
  assert.equal(
    isSpendingAccount(acct({ type: "everyday", spending: false })),
    false,
  );
});

test("isSpendingAccount falls back to type === 'everyday' when unset", () => {
  assert.equal(isSpendingAccount(acct({ type: "everyday" })), true);
  assert.equal(isSpendingAccount(acct({ type: "savings" })), false);
});
