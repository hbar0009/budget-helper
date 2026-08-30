import assert from "node:assert/strict";
import { test } from "node:test";

import { SINK_COLUMNS, type Cell, planSheetWrite } from "./plan.ts";
import { SinkError, type SinkRow } from "./types.ts";

function row(p: Partial<SinkRow> & Pick<SinkRow, "id">): SinkRow {
  return {
    id: p.id,
    date: p.date ?? "2026-08-10",
    description: p.description ?? "Row",
    account: p.account ?? "Personal Everyday",
    category: p.category ?? "Eating Out",
    subcategory: p.subcategory ?? "Restaurant",
    gross: p.gross ?? -10,
    reimbursed: p.reimbursed ?? 0,
    net: p.net ?? p.gross ?? -10,
    reimbStatus: p.reimbStatus ?? "",
    owedBy: p.owedBy ?? "",
  };
}

/** The canonical header + one full data row, as the sheet would store them. */
function sheetRow(r: SinkRow): Cell[] {
  return SINK_COLUMNS.map((c) =>
    c === "reimb_status"
      ? r.reimbStatus
      : c === "owed_by"
        ? r.owedBy
        : (r as unknown as Record<string, Cell>)[c],
  );
}

test("an empty sheet gets the header and every row appended", () => {
  const plan = planSheetWrite([], [row({ id: "a" }), row({ id: "b" })]);
  assert.deepEqual(plan.header, [...SINK_COLUMNS]);
  assert.equal(plan.appends.length, 2);
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.appends[0][0], "a");
});

test("re-pushing identical rows changes nothing", () => {
  const a = row({ id: "a" });
  const existing: Cell[][] = [[...SINK_COLUMNS], sheetRow(a)];
  const plan = planSheetWrite(existing, [a]);
  assert.deepEqual(plan, { updates: [], appends: [], unchanged: 1 });
});

test("a changed cell becomes an in-place update at the right row number", () => {
  const before = row({ id: "a", net: -10, reimbursed: 0 });
  const after = row({ id: "a", net: -4, reimbursed: 6, reimbStatus: "partial" });
  const existing: Cell[][] = [
    [...SINK_COLUMNS],
    ["filler"],
    sheetRow(before), // sheet row 3
  ];
  const plan = planSheetWrite(existing, [after]);
  assert.equal(plan.unchanged, 0);
  assert.equal(plan.appends.length, 0);
  assert.equal(plan.updates.length, 1);
  assert.equal(plan.updates[0].rowNumber, 3);
  assert.equal(plan.updates[0].cells[SINK_COLUMNS.indexOf("net")], -4);
});

test("new rows append while existing ones update, matched by id not order", () => {
  const a = row({ id: "a" });
  const b = row({ id: "b", net: -99 });
  const existing: Cell[][] = [[...SINK_COLUMNS], sheetRow(b), sheetRow(a)];
  const plan = planSheetWrite(existing, [
    row({ id: "a" }),
    row({ id: "b", net: -1 }), // changed
    row({ id: "c" }), // new
  ]);
  assert.equal(plan.unchanged, 1); // a
  assert.equal(plan.updates.length, 1); // b
  assert.equal(plan.updates[0].rowNumber, 2);
  assert.deepEqual(plan.appends.map((r) => r[0]), ["c"]);
});

test("number vs string and 12 vs 12.00 don't count as changes", () => {
  const a = row({ id: "a", gross: -12, net: -12 });
  const existing: Cell[][] = [
    [...SINK_COLUMNS],
    sheetRow(a).map((c) => (typeof c === "number" ? c.toFixed(2) : c)),
  ];
  assert.equal(planSheetWrite(existing, [a]).unchanged, 1);
});

test("a reordered header with extra user columns is honoured and preserved", () => {
  const header = ["notes", "id", "date", "net", "gross"];
  const existing: Cell[][] = [
    header,
    ["my note", "a", "2026-08-01", "-10", "-10"],
  ];
  const plan = planSheetWrite(existing, [row({ id: "a", net: -3, gross: -10 })]);
  assert.equal(plan.updates.length, 1);
  const cells = plan.updates[0].cells;
  assert.equal(cells[0], "my note"); // untouched user column
  assert.equal(cells[1], "a");
  assert.equal(cells[3], -3); // net updated
});

test("a header row without an id column is rejected", () => {
  assert.throws(
    () => planSheetWrite([["date", "amount"], ["2026-08-01", "-10"]], [row({ id: "a" })]),
    SinkError,
  );
});
