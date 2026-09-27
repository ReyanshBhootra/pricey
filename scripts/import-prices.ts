// Loads real scraped prices (format: docs/REAL_PRICES.md).
//   npm run import:prices              checks data/pricey-prices.json (or data/stores.csv + data/prices.csv)
//                                      and writes src/lib/real-prices.json
//   npm run import:prices -- --file some.json   a JSON file somewhere else
//   npm run import:prices -- --check   only checks, writes nothing
//   npm run import:prices -- --only-real   hide the made-up demo stores and prices
//   npm run import:prices -- --clear   go back to demo data only
// Then commit src/lib/real-prices.json and push; the site picks it up on the next deploy.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkImport, checkImportJson, domainOf } from "../src/lib/real-prices";

const root = join(import.meta.dirname, "..");
const out = join(root, "src/lib/real-prices.json");
const args = new Set(process.argv.slice(2));
const flag = (name: string) => process.argv.find((a, i) => process.argv[i - 1] === name);
const dir = flag("--dir") ?? join(root, "data");
const json = flag("--file") ?? (existsSync(join(dir, "pricey-prices.json")) ? join(dir, "pricey-prices.json") : null);

if (args.has("--clear")) {
  writeFileSync(out, JSON.stringify({ importedAt: null, onlyReal: false, stores: [], reports: [] }, null, 1) + "\n");
  console.log("Cleared. The app is back to demo data. Commit src/lib/real-prices.json to apply.");
  process.exit(0);
}

const read = (name: string) => {
  const p = join(dir, name);
  if (!existsSync(p)) {
    console.error(`Missing ${p}. Put your friend's file at data/pricey-prices.json, or data/stores.csv and data/prices.csv (see docs/REAL_PRICES.md).`);
    process.exit(1);
  }
  return readFileSync(p, "utf8");
};

const opts = { onlyReal: args.has("--only-real") };
if (json && !existsSync(json)) {
  console.error(`Missing ${json}.`);
  process.exit(1);
}
if (json) console.log(`Reading ${json}\n`);
const { data, errors, warnings } = json ? checkImportJson(readFileSync(json, "utf8"), opts) : checkImport(read("stores.csv"), read("prices.csv"), opts);

for (const w of warnings) console.log(`  warning  ${w}`);
// A whole file of the same mistake is easier to read summarized.
const shown = errors.slice(0, 25);
for (const e of shown) console.log(`  ERROR    ${e}`);
if (errors.length > shown.length) console.log(`  ...and ${errors.length - shown.length} more errors`);
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
