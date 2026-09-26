// Checks the core loop end to end on whatever backend is configured:
// read a trusted price, submit reports, watch vouching move it.
//   npm run smoke
import assert from "node:assert/strict";
import { getNearbyStores, getPricesForItem, getActiveEvents, submitReport } from "../src/lib/data";
import { trustedPrice } from "../src/lib/vouch";

async function main() {
  const shoprite = (await getPricesForItem("potatoes-5lb")).find((p) => p.storeId === "shoprite-staten-island");
  assert.equal(shoprite?.price, 10, "10 people say $10, 2 say $7, trusted should be $10");
  console.log("vouching: potatoes at ShopRite =", shoprite?.price, `(${shoprite?.votes}/${shoprite?.totalReports} votes)`);

  const nearby = await getNearbyStores(40.7342, -73.9897, 2);
  assert.ok(nearby.length > 0 && nearby[0].id === "trader-joes-union-sq");
  console.log("nearby Union Sq:", nearby.map((s) => s.name).join(", "));

  const r = await submitReport({ itemId: "eggs-dozen", storeId: "bodega-bushwick", price: 3.99, userId: "smoke", type: "price" });
  console.log("submitted:", r.report.id, "changed:", r.priceChanged, r.oldPrice, "->", r.newPrice);

  const t = (p: number, ts: number, userId = `u${ts}`) => ({ id: "", itemId: "x", storeId: "y", price: p, timestamp: ts, userId, type: "price" as const });
  assert.equal(trustedPrice([t(7, 1), t(7, 2), t(10, 3)])?.price, 7, "majority wins");
  assert.equal(trustedPrice([t(7, 1), t(10, 5)])?.price, 10, "two-way tie goes to most recent");
  assert.equal(trustedPrice([t(5, 1), t(7, 2), t(9, 3)])?.price, 7, "three-way tie goes to median");
  const spam = [t(7, 1), t(7, 2), t(7, 3), ...Array.from({ length: 8 }, (_, i) => t(1, 10 + i, "spammer"))];
  assert.equal(trustedPrice(spam)?.price, 7, "one user spamming counts once");
  assert.equal(trustedPrice([t(1, 1, "a"), t(9, 2, "a"), t(9, 3, "b"), t(1, 4, "c")])?.price, 9, "a user's latest report replaces their earlier one");
  const day = 24 * 60 * 60 * 1000;
  assert.equal(trustedPrice([t(10, 1), t(10, 2), t(10, 3), t(7, 40 * day)])?.price, 7, "reports older than 30 days age out");

  const events = await getActiveEvents();
  console.log("active events:", events.length);
  console.log("OK");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
