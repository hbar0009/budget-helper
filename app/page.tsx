import ImportPanel from "./import-panel";

export default function HomePage() {
  return (
    <main>
      <h1>budget-helper</h1>
      <p>
        Import step: parse all four statement CSVs at once, assign each to an
        account, and classify inter-account transfers. Categorization and
        spreadsheet sync are not built yet.
      </p>
      <ImportPanel />
    </main>
  );
}
