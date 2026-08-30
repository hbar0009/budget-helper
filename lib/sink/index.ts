/**
 * Resolve a group's `sink` config (`config/accounts.json`) to a `Sink`.
 * `kind` picks the implementation.
 */

import type { SinkConfig } from "../accounts/config.ts";
import { type GoogleSheetsSinkConfig, googleSheetsSink } from "./sheets.ts";
import { type Sink, SinkError } from "./types.ts";

export { SinkError } from "./types.ts";
export type { Sink, SinkRow, PushResult } from "./types.ts";
export { buildSinkRowsByGroup, isSinkable } from "./rows.ts";

export function sinkFor(config: SinkConfig): Sink {
  switch (config.kind) {
    case "google-sheets": {
      const cfg = config as SinkConfig & Partial<GoogleSheetsSinkConfig>;
      if (!cfg.spreadsheetId || !cfg.tab) {
        throw new SinkError(
          'a "google-sheets" sink needs `spreadsheetId` and `tab` in config/accounts.json',
        );
      }
      return googleSheetsSink({ spreadsheetId: cfg.spreadsheetId, tab: cfg.tab });
    }
    default:
      throw new SinkError(
        `unknown sink kind "${config.kind}" in config/accounts.json (supported: google-sheets)`,
      );
  }
}
