// Checks the core loop end to end on whatever backend is configured:
// read a trusted price, submit reports, watch vouching move it.
//   npm run smoke
import assert from "node:assert/strict";
import { getNearbyStores, getPricesForItem, getActiveEvents, submitReport } from "../src/lib/data";
import { computeTrust, setTrustWeights, trustedPrice } from "../src/lib/vouch";
import { answerFromData, buildContext, matchItems } from "../src/lib/grounding";
import { SEED_ITEMS } from "../src/lib/seed";
import { describeChange, priceHistory } from "../src/lib/history";
import { FARE, optimizeList, planText } from "../src/lib/optimizer";
import { kmToMiles } from "../src/lib/format";
import { distanceKm } from "../src/lib/vouch";
import { checkImport, parseCsv } from "../src/lib/real-prices";

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

  // Trust: people who usually match the crowd count more, people who are usually off count less.
  const rep = (user: string, item: string, store: string, price: number, ts = 1) => ({ id: "", itemId: item, storeId: store, price, timestamp: ts, userId: user, type: "price" as const });
  const history = [];
  for (const item of ["a", "b", "c"]) {
    for (const u of ["good1", "good2", "crowd1", "crowd2"]) history.push(rep(u, item, "s1", 4));
    for (const u of ["liar1", "liar2", "liar3"]) history.push(rep(u, item, "s1", 1));
  }
  const stats = computeTrust(history);
  assert.equal(stats.get("good1")?.weight, 1.5);
  assert.equal(stats.get("liar1")?.weight, 0.5);
  setTrustWeights(new Map([...stats].map(([u, st]) => [u, st.weight])));
  const contested = [rep("good1", "x", "s2", 5), rep("good2", "x", "s2", 5), rep("liar1", "x", "s2", 2), rep("liar2", "x", "s2", 2), rep("liar3", "x", "s2", 2)];
  assert.equal(trustedPrice(contested)?.price, 5, "2 reliable reporters outweigh 3 unreliable ones");
  assert.equal(trustedPrice(contested, false)?.price, 2, "without trust, the raw majority would win");
  assert.equal(trustedPrice(contested)?.votes, 2, "shown votes still count people");
  setTrustWeights(new Map());
  console.log("trust: 2 reliable voices beat 3 unreliable ones");

  // Price history: the seed has eggs climbing ~18% over the month.
  const eggTrend = await priceHistory("eggs-dozen");
  assert.ok(eggTrend.points.length > 20, "a point for most days");
  assert.ok((eggTrend.changePct ?? 0) >= 8, `eggs should be up, got ${eggTrend.changePct}%`);
  assert.match(describeChange(eggTrend.changePct)!, /^Up \d+% this month$/);
  assert.equal(describeChange(1), "Steady this month");
  console.log("history:", describeChange(eggTrend.changePct), `(${eggTrend.points[0].price} -> ${eggTrend.points.at(-1)!.price})`);

  // Shopping list: nothing far away, fares counted, second stops only when close and worth it.
  const match = (n: string, all: Parameters<typeof matchItems>[1]) => matchItems(n, all)[0] ?? null;
  const spots = [
    { lat: 40.7342, lng: -73.9897, label: "Union Sq" },
    { lat: 40.6712, lng: -73.9814, label: "11215" },
    { lat: 40.5795, lng: -74.1502, label: "Staten Island" },
    { lat: 40.8367, lng: -73.8903, label: "Bronx" },
  ];
  for (const where of spots) {
    const r = await optimizeList(["eggs", "milk", "bread", "bananas", "unicorn meat"], where, match);
    assert.deepEqual(r.unknown, ["unicorn meat"]);
    assert.ok(r.best, `a plan near ${where.label}`);
    for (const plan of [r.best, r.split].filter((p) => p !== null)) {
      for (const st of plan.stops) {
        assert.ok(st.miles !== null && st.miles <= 3, `${st.store.name} is ${st.miles} mi from ${where.label}: too far`);
        assert.equal(st.fare, st.miles! > 0.75 && st === plan.stops[0] ? FARE * 2 : 0, "fare only when not walkable, and once");
      }
      assert.equal(plan.total, Math.round((plan.groceries + plan.stops[0].fare) * 100) / 100, "total includes the fare");
    }
    if (r.split) {
      const [a, b] = r.split.stops;
      const apart = kmToMiles(distanceKm(a.store.lat, a.store.lng, b.store.lat, b.store.lng));
      assert.ok(apart <= 0.5 || (a.miles! <= 0.75 && b.miles! <= 0.75), "second stop must be next door or both walkable");
      assert.ok(r.split.saves >= 3 || r.split.missing.length < r.best!.missing.length, "a split must save at least $3 or cover more");
    }
    console.log(`list near ${where.label}:`, planText(r).split("\n")[0], r.split ? `| split saves ${r.split.saves}` : "| no split");
  }
  const none = await optimizeList(["eggs"], null, match);
  assert.ok(none.best && none.best.stops[0].fare === 0 && none.best.stops[0].miles === null, "no location: no made-up distances");

  // Real price importer: quoted CSV, unit mix-ups, bad rows, sale prices.
  assert.deepEqual(parseCsv('\uFEFFa,b\r\n"x, y","say ""hi"""\r\n'), [["a", "b"], ["x, y", 'say "hi"']]);
  const storesCsv = "store_id,name,address,borough,lat,lng,source_url\naldi-rego-park,Aldi Rego Park,\"96-05 Queens Blvd, Queens\",queens,40.7296,-73.8617,https://www.aldi.us/\n";
  const good = checkImport(storesCsv, "store_id,item_id,price,sale_price,listed_as,product_name,source_url,scraped_at\naldi-rego-park,milk-gallon,3.29,2.99,,Milk,,2026-09-25\naldi-rego-park,eggs-dozen,0.25,,per egg,Eggs,,2026-09-25\n", { now: Date.parse("2026-09-26") });
  assert.deepEqual(good.errors, []);
  assert.equal(good.data.stores[0].borough, "Queens");
  assert.equal(good.data.reports[0].price, 2.99, "sale price is what you pay");
  assert.equal(good.data.reports[0].userId, "import:aldi.us", "the site counts as one voice");
  assert.ok(good.warnings.some((w) => /far from the usual/.test(w)), "per-egg price flagged as a unit mix-up");
  const bad = checkImport(storesCsv, "store_id,item_id,price,scraped_at\nnope,caviar,abc,26/09/2026\n");
  assert.equal(bad.errors.length, 1);
  assert.match(bad.errors[0], /line 2: .*isn't in stores.csv.*isn't one of the 16.*should be a number.*should look like/);
  console.log("importer: validates rows, flags unit mix-ups, uses sale prices");

  console.log("OK");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
