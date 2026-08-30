/**
 * The `google-sheets` sink: writes a group's rows to a tab in a Google Sheet,
 * matching on the `id` column so a re-push updates rows in place.
 *
 * Server-only. Auth is a Google service-account key JSON at
 * `config/service-account.json` (gitignored; override with
 * `BUDGET_GOOGLE_KEY_PATH`); share the target sheet with the key's
 * `client_email`. All the diff logic lives in `plan.ts` — this file only talks
 * to the Sheets v4 REST API.
 */

import path from "node:path";
import { GoogleAuth } from "google-auth-library";
import { type Cell, planSheetWrite } from "./plan.ts";
import { type PushResult, type Sink, SinkError, type SinkRow } from "./types.ts";

const KEY_PATH =
  process.env.BUDGET_GOOGLE_KEY_PATH ??
  path.join(process.cwd(), "config", "service-account.json");

const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const API = "https://sheets.googleapis.com/v4/spreadsheets";

export interface GoogleSheetsSinkConfig {
  spreadsheetId: string;
  /** Tab (sheet) name to write to. */
  tab: string;
}

export function googleSheetsSink(config: GoogleSheetsSinkConfig): Sink {
  return { push: (rows) => push(config, rows) };
}

let auth: GoogleAuth | undefined;

async function accessToken(): Promise<string> {
  auth ??= new GoogleAuth({ keyFile: KEY_PATH, scopes: [SCOPE] });
  let token: string | null | undefined;
  try {
    token = (await (await auth.getClient()).getAccessToken()).token;
  } catch (err) {
    throw new SinkError(
      `could not authenticate with Google (check ${path.relative(process.cwd(), KEY_PATH)}): ${(err as Error).message}`,
    );
  }
  if (!token) throw new SinkError("Google returned no access token");
  return token;
}

async function sheetsFetch(
  token: string,
  url: string,
  init: RequestInit,
  doing: string,
): Promise<unknown> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!res.ok) {
    let detail = await res.text();
    try {
      detail = JSON.parse(detail)?.error?.message ?? detail;
    } catch {
      /* keep the raw text */
    }
    throw new SinkError(`Google Sheets rejected ${doing} (${res.status}): ${detail}`);
  }
  return res.json();
}

async function push(
  config: GoogleSheetsSinkConfig,
  rows: SinkRow[],
): Promise<PushResult> {
  const token = await accessToken();
  const sheet = `${API}/${encodeURIComponent(config.spreadsheetId)}`;
  const tab = config.tab;

  const read = (await sheetsFetch(
    token,
    `${sheet}/values/${encodeURIComponent(tab)}?majorDimension=ROWS`,
    { method: "GET" },
    "reading the tab",
  )) as { values?: Cell[][] };

  const plan = planSheetWrite(read.values ?? [], rows);

  const data: { range: string; values: Cell[][] }[] = [];
  if (plan.header) data.push({ range: `${tab}!A1`, values: [plan.header] });
  for (const u of plan.updates) {
    data.push({ range: `${tab}!A${u.rowNumber}`, values: [u.cells] });
  }
  if (data.length > 0) {
    await sheetsFetch(
      token,
      `${sheet}/values:batchUpdate`,
      { method: "POST", body: JSON.stringify({ valueInputOption: "RAW", data }) },
      "writing rows",
    );
  }

  if (plan.appends.length > 0) {
    await sheetsFetch(
      token,
      `${sheet}/values/${encodeURIComponent(`${tab}!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { method: "POST", body: JSON.stringify({ values: plan.appends }) },
      "appending rows",
    );
  }

  return {
    added: plan.appends.length,
    updated: plan.updates.length,
    unchanged: plan.unchanged,
  };
}
