import assert from "node:assert/strict";
import { test } from "node:test";
import { CsvImportError, parseCsv } from "./parse.ts";

const SAMPLE = `Date,Description,Credit,Debit,Balance
28/08/2026,Internal Transfer - Receipt 25368,100.00,,151.30
28/08/2026,"SOME COMPANY PTY LTD, MELBOURNE",,-298.30,51.30
`;

test("parses credit rows as positive and debit rows as negative", () => {
  const { transactions, errors } = parseCsv(SAMPLE);

  assert.equal(errors.length, 0);
  assert.equal(transactions.length, 2);

  assert.equal(transactions[0].date, "2026-08-28");
  assert.equal(transactions[0].amount, 100);
  assert.equal(transactions[0].direction, "credit");

  assert.equal(transactions[1].amount, -298.3);
  assert.equal(transactions[1].direction, "debit");
  // Quoted comma inside the description is preserved.
  assert.equal(transactions[1].description, "SOME COMPANY PTY LTD, MELBOURNE");
});

test("row ids are stable across imports and unique within one", () => {
  const first = parseCsv(SAMPLE).transactions.map((t) => t.id);
  const second = parseCsv(SAMPLE).transactions.map((t) => t.id);

  assert.deepEqual(first, second);
  assert.notEqual(first[0], first[1]);
});

test("rejects a file whose header row matches no profile", () => {
  assert.throws(() => parseCsv("Foo,Bar\n1,2\n"), CsvImportError);
});

test("collects per-row errors instead of aborting the import", () => {
  const withOneBadRow = `Date,Description,Credit,Debit,Balance
notadate,Broken row,,-1.00,10.00
27/08/2026,Good row,,-9.74,149.60
`;

  const { transactions, errors } = parseCsv(withOneBadRow);

  assert.equal(transactions.length, 1);
  assert.equal(transactions[0].description, "Good row");
  assert.equal(errors.length, 1);
  assert.equal(errors[0].row, 1);
});

test("flags a row that has neither credit nor debit", () => {
  const noAmount = `Date,Description,Credit,Debit,Balance
27/08/2026,Nothing here,,,149.60
`;

  const { transactions, errors } = parseCsv(noAmount);

  assert.equal(transactions.length, 0);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /exactly one of Credit \/ Debit/);
});
