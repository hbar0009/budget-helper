/**
 * Loads and validates `config/accounts.json` — the list of your bank accounts
 * and where each group's data should be written.
 *
 * Server-only (reads the filesystem). `config/accounts.json` is gitignored;
 * `config/accounts.example.json` is the template to copy.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

export type AccountType = "everyday" | "savings";

export interface Account {
  /** Stable key you choose, e.g. `personal-everyday`. */
  id: string;
  /** Human label shown in the UI. */
  label: string;
  /** Bank account number. Used to spot inter-account transfers in descriptions. */
  number: string;
  type: AccountType;
  /** Group key — must exist in `groups`. Drives which spreadsheet the data goes to. */
  group: string;
}

/** Where one group's categorized transactions are written. `kind` selects the
 *  implementation; the rest is implementation-specific and validated later by
 *  the sink itself (not built yet). */
export interface SinkConfig {
  kind: string;
  [key: string]: unknown;
}

export interface AccountGroup {
  sink: SinkConfig;
}

export interface AccountsConfig {
  accounts: Account[];
  groups: Record<string, AccountGroup>;
}

export class AccountsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountsConfigError";
  }
}

const CONFIG_PATH = path.join(process.cwd(), "config", "accounts.json");

export async function loadAccountsConfig(): Promise<AccountsConfig> {
  let raw: string;
  try {
    raw = await readFile(CONFIG_PATH, "utf8");
  } catch {
    throw new AccountsConfigError(
      "No config/accounts.json found. Copy config/accounts.example.json to " +
        "config/accounts.json and fill in your accounts.",
    );
  }

  let parsed: AccountsConfig;
  try {
    parsed = JSON.parse(raw) as AccountsConfig;
  } catch (err) {
    throw new AccountsConfigError(
      `config/accounts.json is not valid JSON: ${(err as Error).message}`,
    );
  }

  validate(parsed);
  return parsed;
}

/** Index accounts by id. */
export function accountMap(config: AccountsConfig): Map<string, Account> {
  return new Map(config.accounts.map((account) => [account.id, account]));
}

function validate(config: AccountsConfig): void {
  if (!Array.isArray(config.accounts) || config.accounts.length === 0) {
    throw new AccountsConfigError("`accounts` must be a non-empty array.");
  }
  if (!config.groups || typeof config.groups !== "object") {
    throw new AccountsConfigError("`groups` must be an object.");
  }

  const seen = new Set<string>();
  for (const account of config.accounts) {
    for (const field of ["id", "label", "number", "type", "group"] as const) {
      if (!account[field]) {
        throw new AccountsConfigError(
          `Account is missing "${field}": ${JSON.stringify(account)}`,
        );
      }
    }
    if (seen.has(account.id)) {
      throw new AccountsConfigError(`Duplicate account id "${account.id}".`);
    }
    seen.add(account.id);
    if (!config.groups[account.group]) {
      throw new AccountsConfigError(
        `Account "${account.id}" references group "${account.group}", ` +
          "which is not defined in `groups`.",
      );
    }
  }

  for (const [name, group] of Object.entries(config.groups)) {
    if (!group?.sink?.kind) {
      throw new AccountsConfigError(`Group "${name}" is missing \`sink.kind\`.`);
    }
  }
}
