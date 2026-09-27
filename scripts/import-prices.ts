// Loads real scraped prices (format: docs/REAL_PRICES.md).
//   npm run import:prices              checks data/stores.csv + data/prices.csv and writes src/lib/real-prices.json
//   npm run import:prices -- --check   only checks, writes nothing
//   npm run import:prices -- --only-real   hide the made-up demo stores and prices
//   npm run import:prices -- --clear   go back to demo data only
// Then commit src/lib/real-prices.json and push; the site picks it up on the next deploy.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkImport, domainOf } from "../src/lib/real-prices";

const root = join(import.meta.dirname, "..");
const out = join(root, "src/lib/real-prices.json");
const args = new Set(process.argv.slice(2));
const dir = process.argv.find((a, i) => process.argv[i - 1] === "--dir") ?? join(root, "data");

if (args.has("--clear")) {
  writeFileSync(out, JSON.stringify({ importedAt: null, onlyReal: false, stores: [], reports: [] }, null, 1) + "\n");
  console.log("Cleared. The app is back to demo data. Commit src/lib/real-prices.json to apply.");
  process.exit(0);
}

const read = (name: string) => {
  const p = join(dir, name);
  if (!existsSync(p)) {
    console.error(`Missing ${p}. Put your friend's files at data/stores.csv and data/prices.csv (see docs/REAL_PRICES.md).`);
    process.exit(1);
  }
  return readFileSync(p, "utf8");
};

const { data, errors, warnings } = checkImport(read("stores.csv"), read("prices.csv"), { onlyReal: args.has("--only-real") });

for (const w of warnings) console.log(`  warning  ${w}`);
for (const e of errors) console.log(`  ERROR    ${e}`);
const stores = new Set(data.reports.map((r) => r.storeId)).size;
const items = new Set(data.reports.map((r) => r.itemId)).size;
const sites = [...new Set(data.reports.map((r) => domainOf(r.sourceUrl)).filter(Boolean))];
console.log(`\n${data.reports.length} prices across ${stores} stores and ${items} of 16 items${sites.length ? `, from ${sites.join(", ")}` : ""}.`);

if (errors.length) {
  console.log(`\n${errors.length} row${errors.length > 1 ? "s" : ""} need fixing first. Nothing was written.`);
  process.exit(1);
}
if (args.has("--check")) {
  console.log("Looks good. Run without --check to load it.");
  process.exit(0);
}
writeFileSync(out, JSON.stringify(data, null, 1) + "\n");
console.log(`Wrote src/lib/real-prices.json${data.onlyReal ? " (real stores only)" : " (real prices replace the demo ones for these stores)"}.`);
console.log("Next: commit that file and push. The live site updates on the next deploy.");
