// Checks the core loop end to end on whatever backend is configured:
// read a trusted price, submit reports, watch vouching move it.
//   npm run smoke
import assert from "node:assert/strict";
import { getNearbyStores, getPricesForItem, getActiveEvents, submitReport } from "../src/lib/data";
import { trustedPrice } from "../src/lib/vouch";
import { answerFromData, buildContext, matchItems } from "../src/lib/grounding";
import { SEED_ITEMS } from "../src/lib/seed";

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
  // Grounding (chatbot): questions map to items, answers quote real data.
  assert.deepEqual(matchItems("how much are eggs near me?", SEED_ITEMS).map((i) => i.id), ["eggs-dozen"]);
  assert.deepEqual(matchItems("cheapest latte", SEED_ITEMS).map((i) => i.id), ["latte-12oz"]);
  assert.deepEqual(matchItems("what can I cook cheap right now", SEED_ITEMS), []);
  const ctx = await buildContext("how much are eggs near me", { lat: 40.7342, lng: -73.9897 });
  assert.ok(ctx.text.includes("Eggs (dozen)") && ctx.mentioned[0].prices.length > 0);
  const eggs = answerFromData("how much are eggs near me", ctx);
  assert.match(eggs, /^Eggs \(dozen\) near you: \$\d/);
  console.log("grounded fallback:", eggs);
  const meal = answerFromData("what can I cook for under $10", await buildContext("what can I cook for under $10"));
  const total = Number(meal.match(/Total: \$(\d+\.\d\d)/)?.[1]);
  assert.ok(total > 0 && total <= 10, "meal respects the $10 budget: " + meal);
  console.log("meal fallback:\n" + meal);
  const convo = await buildContext("how much are eggs near me\nwhat can I cook for under $10");
  assert.match(answerFromData("what can I cook for under $10", convo), /cheap meal/, "new intent wins over earlier item");
  assert.match(answerFromData("is that the cheapest?", await buildContext("how much are eggs\nis that the cheapest?")), /^Eggs/, "follow-up keeps the item");
  assert.match(answerFromData("i am hungry and have paneer and an airfryer, what can i make", await buildContext("i am hungry, what can i make")), /cheap meal/, "hungry/make questions get a meal");
  assert.match(answerFromData("any free food right now", await buildContext("any free food right now")), /deals right now/);

  console.log("OK");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
