// Checks that messy real-world texts are understood.   npm run test:texting
import assert from "node:assert/strict";
import { SEED_STORES } from "../src/lib/seed";
import { findBorough, findPrice, handleText, matchStore } from "../src/lib/texting";
import { findPlace } from "../src/lib/places";
import { miles } from "../src/lib/format";

async function main() {
  // Prices: the right number, not sizes or times.
  const prices: [string, number | null][] = [
    ["eggs 3.99 at key food park slope", 3.99],
    ["eggs $4 at key food", 4],
    ["potatoes 5 lb 4.99 at shoprite", 4.99],
    ["potatoes 5lb $6 at shoprite", 6],
    ["free bagels until 5pm at myrtle deli", null],
    ["milk 12 at c-town", 12],
  ];
  for (const [t, want] of prices) assert.equal(findPrice(t), want, t);

  // Stores: casual names find the right one; ambiguous ones ask.
  const store = (t: string) => matchStore(t, SEED_STORES).store?.id ?? null;
  assert.equal(store("key food park slope"), "key-food-park-slope");
  assert.equal(store("trader joes union sq"), "trader-joes-union-sq");
  assert.equal(store("the hmart in flushing"), "hmart-flushing");
  assert.equal(store("patel brothers"), "patel-bros-jackson-hts");
  assert.equal(store("key food"), null, "three Key Foods: must ask");
  assert.equal(matchStore("key food", SEED_STORES).suggestions.length, 3);
  assert.equal(store("some random place"), null);

  assert.equal(findBorough("deals in bk"), "Brooklyn");

  // Places: ZIPs and neighborhoods, most specific wins; boroughs alone are not places.
  assert.equal(findPlace("cheap eggs near 11215")?.label, "11215");
  assert.equal(findPlace("anything near union sq?")?.label, "Union Square");
  assert.equal(findPlace("im in park slope")?.borough, "Brooklyn");
  assert.equal(findPlace("upper west side")?.label, "Upper West Side");
  assert.equal(findPlace("in brooklyn"), null);
  assert.equal(findPlace("90210"), null, "not NYC");
  assert.equal(miles(1), "0.6 mi");
  assert.equal(miles(0.1), "350 ft");
  assert.equal(miles(20), "12 mi");
  assert.equal(findBorough("any free food on staten island"), "Staten Island");

  // End to end on seed data (no Gemini key: questions answer from data).
  const say = async (t: string) => (await handleText("+15551234567", t)).reply;
  assert.match(await say("help"), /Report: eggs/);
  assert.match(await say("eggs 3.99 at key food park slope"), /Eggs \(dozen\) at Key Food Park Slope/);
  assert.match(await say("eggs 3.99 at key food"), /Which store\? Did you mean Key Food/);
  assert.match(await say("unicorn steak 9.99 at key food park slope"), /couldn't tell which item/);
  assert.equal(await say("free bagels at myrtle deli until 5pm"), 'Posted! People near Myrtle Deli & Grocery will see: "free bagels until 5pm". Thanks for sharing.');
  assert.match(await say("deals in brooklyn"), /spots? in Brooklyn (has|have) discounts right now:[\s\S]*free bagels/i);
  const eggs = await say("how much are eggs in brooklyn?");
  assert.match(eggs, /^Eggs \(dozen\) in Brooklyn: \$\d/, eggs);
  assert.doesNotMatch(eggs, /near you|mi |km|walk/, eggs); // borough only: no made-up distances
  const eggsZip = await say("how much are eggs near 11215?");
  assert.match(eggsZip, /^Eggs \(dozen\) near 11215: \$\d.* mi from 11215, \d+ min walk\)/, eggsZip);
  const on = await handleText("+15551234567", "alerts on queens");
  assert.deepEqual(on.action, { subscribe: "Queens" });
  assert.deepEqual((await handleText("+15551234567", "stop")).action, { unsubscribe: true });

  // Same phone, spamming a price: counts once.
  for (let i = 0; i < 5; i++) await say("milk 0.50 at trader joes union sq");
  assert.match(await say("milk 0.50 at trader joes union sq"), /Thanks/);

  console.log("texting OK");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
