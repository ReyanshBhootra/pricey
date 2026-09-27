// Tests the texting agent's plumbing with a scripted stand-in for Gemini: it asks for the
// tools Gemini would, then echoes the tool results so we can check what really happened.
//   npm run test:agent
import assert from "node:assert/strict";
process.env.CONTACT_CARD = "on"; // the card is off in production; test the once-only logic
import type { Content } from "@google/genai";
import type { ModelCall } from "../src/lib/agent";
import { getForumPosts, getUser } from "../src/lib/data";
import { phoneUserId } from "../src/lib/phone";
import { handleText } from "../src/lib/texting";

type Call = { name: string; args: Record<string, unknown> };
const seen: { system: string; tools: boolean }[] = [];

// script(text) says which tool calls to make for a message; after tools run, reply with their results.
function stand_in(script: (text: string) => Call[]): ModelCall {
  return async ({ contents, systemInstruction, tools }) => {
    seen.push({ system: systemInstruction, tools });
    const last = contents.at(-1) as Content;
    const results = last.parts?.filter((p) => p.functionResponse).map((p) => p.functionResponse!.response) ?? [];
    if (results.length) return { text: `RESULTS ${JSON.stringify(results)}`, functionCalls: undefined, candidates: [] };
    const userText = last.parts?.map((p) => p.text ?? "").join(" ") ?? "";
    const calls = script(userText);
    if (!calls.length) return { text: `HELLO ${userText.slice(0, 40)}`, functionCalls: undefined, candidates: [] };
    return { functionCalls: calls.map((c, i) => ({ ...c, id: `c${i}` })), text: undefined, candidates: [{ content: { role: "model", parts: calls.map((c) => ({ functionCall: c })) } }] };
  };
}

async function main() {
  const phone = "+15557770001";
  const send = (text: string, calls: Call[] = [], extra: Parameters<typeof handleText>[2] = {}) =>
    handleText(phone, text, { model: stand_in(() => calls), spaceId: "any;-;+15557770001", ...extra });

  // First message: welcome instructions in the prompt, contact card, space id saved.
  let r = await send("yo");
  assert.match(seen.at(-1)!.system, /FIRST MESSAGE EVER/);
  assert.equal(r.contactCard, true);
  assert.equal(r.source, "gemini");
  r = await send("hey again");
  assert.doesNotMatch(seen.at(-1)!.system, /FIRST MESSAGE EVER/, "welcome only once");
  assert.equal(r.contactCard, false);
  console.log("PASS welcome once, contact card once");

  // Home from a ZIP; then a natural-language report where "key food" is ambiguous, resolved by home.
  r = await send("im in 11215", [{ name: "set_home", args: { place: "11215" } }]);
  assert.match(r.reply, /"home":"11215"/);
  assert.equal(r.react, "👍");
  r = await send("paid like 4 bucks for eggs at the key food on 5th ave", [{ name: "report_price", args: { item: "eggs", store: "key food on 5th ave", price: 4 } }]);
  assert.match(r.reply, /"saved":true/);
  assert.match(r.reply, /"store":"Key Food Park Slope"/, "closest Key Food to 11215");
  assert.equal(r.react, "👍");
  console.log("PASS natural report, ambiguous store resolved by home ZIP, tapback");

  // Lookups: distances measured from their home ZIP, in miles.
  r = await send("how much are eggs", [{ name: "lookup_prices", args: { items: ["eggs"] } }]);
  assert.match(r.reply, /"measured_from":"11215"/);
  assert.match(r.reply, /mi from 11215/);
  assert.equal(r.react, null, "reading doesn't earn a tapback");
  assert.match(r.reply, /"city_trend":"Up \d+% this month"/, "lookups carry the monthly trend");

  // Shopping list: planned from home, walking counted, unknown items flagged.
  r = await send("need eggs milk bread and dragonfruit", [{ name: "shopping_list", args: { items: ["eggs", "milk", "bread", "dragonfruit"] } }]);
  assert.match(r.reply, /"measured_from":"11215"/);
  assert.match(r.reply, /"best_one_store":\{"store":"[^"]+","distance":"[^"]*mi/);
  assert.match(r.reply, /"not_tracked_yet":\["dragonfruit"\]/);
  assert.equal(r.react, null);
  console.log("PASS shopping list planned from home ZIP");
  r = await send("eggs near astoria?", [{ name: "lookup_prices", args: { items: ["eggs"], place: "astoria" } }]);
  assert.match(r.reply, /mi from Astoria/);
  r = await send("and in the bronx?", [{ name: "lookup_prices", args: { items: ["eggs"], place: "bronx" } }]);
  assert.doesNotMatch(r.reply, /"distance"/, "borough only: no distances");
  console.log("PASS lookups with honest distances");

  // Unknown item and store: clarification, nothing saved.
  r = await send("dragonfruit 9 at key food park slope", [{ name: "report_price", args: { item: "dragonfruit", store: "key food park slope", price: 9 } }]);
  assert.match(r.reply, /unknown_item/);
  assert.equal(r.react, null);
  console.log("PASS unknown item asks instead of saving");

  // Forum: post and read.
  r = await send("post in brooklyn: key food park slope eggs are $4 today", [{ name: "forum_post", args: { borough: "brooklyn", text: "key food park slope eggs are $4 today" } }]);
  assert.match(r.reply, /"posted":true/);
  assert.ok((await getForumPosts("Brooklyn")).some((p) => p.text.includes("eggs are $4 today")));
  r = await send("what's happening in bk", [{ name: "forum_read", args: { borough: "bk" } }]);
  assert.match(r.reply, /eggs are \$4 today/);
  console.log("PASS forum post and read");

  // Track, alerts, deals, store prices.
  r = await send("track eggs for me", [{ name: "track_item", args: { item: "eggs", on: true } }]);
  assert.match(r.reply, /"tracking":true/);
  r = await send("alerts on", [{ name: "set_alerts", args: { on: true } }]);
  assert.match(r.reply, /"area":"Brooklyn"/, "defaults to home borough");
  assert.deepEqual(r.action, { subscribe: "Brooklyn" }, "old relays still get the action");
  r = await send("any free food?", [{ name: "get_deals", args: {} }]);
  assert.match(r.reply, /"spots":\d/);
  r = await send("what's cheap at trader joes union sq", [{ name: "store_prices", args: { store: "trader joes union sq" } }]);
  assert.match(r.reply, /"store":"Trader Joe's Union Square"/);
  let me = await getUser(phoneUserId(phone));
  assert.deepEqual(me?.tracked, ["eggs-dozen"]);
  assert.equal(me?.alerts?.area, "Brooklyn");
  console.log("PASS track, alerts, deals, store lookup");

  // Receipt: pending until confirmed, then saved with a removal.
  const { saveUser } = await import("../src/lib/data");
  await saveUser(phoneUserId(phone), {
    pending: {
      kind: "receipt",
      storeId: "trader-joes-union-sq",
      storeName: "TRADER JOE'S",
      at: Date.now(),
      lines: [
        { name: "Eggs (dozen)", price: 3.29, itemId: "eggs-dozen", category: "dairy", raw: "EGGS" },
        { name: "Bananas (lb)", price: 0.25, itemId: "bananas-lb", category: "produce", raw: "BANANAS" },
        { name: "Mystery snack", price: 2, itemId: null, category: "pantry", raw: "SNACK" },
      ],
    },
  });
  r = await send("yes but drop the mystery snack", [{ name: "receipt_save", args: { remove: ["mystery snack"] } }]);
  assert.match(seen.at(-2)!.system, /PENDING RECEIPT/);
  assert.match(r.reply, /"saved_prices":2/);
  me = await getUser(phoneUserId(phone));
  assert.equal(me?.pending, null);
  console.log("PASS receipt confirm with removal");

  // Receipt from a store Pricey doesn't know: exact totals in the prompt, store added on yes.
  await saveUser(phoneUserId(phone), {
    pending: {
      kind: "receipt",
      storeId: null,
      storeName: "Green Leaf Market",
      storeAddress: "123 Amsterdam Ave, New York, NY 10027",
      subtotal: 45.69,
      total: 47.75,
      at: Date.now(),
      lines: [
        { name: "Bananas (lb)", price: 0.69, itemId: "bananas-lb", category: "produce", raw: "Bananas (1 lb)" },
        { name: "Whole milk (gallon)", price: 4.29, itemId: "milk-gallon", category: "dairy", raw: "Whole Milk (1 gal)" },
        { name: "Chicken breast (2 lb)", price: 8.98, itemId: null, category: "meat", raw: "Chicken Breast (2 lb)" },
      ],
    },
  });
  r = await send("looks right", []);
  const system = seen.at(-1)!.system;
  assert.match(system, /add up to \$13\.96/, "sum computed by code");
  assert.match(system, /total \(with tax\) \$47\.75/);
  assert.match(system, /don't match the subtotal/, "mismatch flagged");
  assert.match(system, /NOT a Pricey store yet/);
  r = await send("yes save it", [{ name: "receipt_save", args: {} }]);
  assert.match(r.reply, /"saved_prices":3/);
  assert.match(r.reply, /"new_store_added":true/);
  const { getStores } = await import("../src/lib/data");
  const added = (await getStores()).find((s) => s.name === "Green Leaf Market");
  assert.equal(added?.borough, "Manhattan", "placed by the ZIP on the receipt");
  console.log("PASS receipt from a new store: exact totals, store added");

  // Gemini down: rules answer, nothing breaks.
  const down: ModelCall = async () => {
    throw new Error("503 UNAVAILABLE");
  };
  r = await handleText(phone, "eggs 3.99 at key food park slope", { model: down });
  assert.equal(r.source, "rules");
  assert.match(r.reply, /Key Food Park Slope/);
  console.log("PASS Gemini down falls back to rules");

  // Rate limit: a runaway loop gets a short "slow down", not 50 Gemini calls.
  const spammer = "+15557770099";
  let last = "";
  for (let i = 0; i < 22; i++) last = (await handleText(spammer, `msg ${i}`, { model: stand_in(() => []) })).reply;
  assert.match(last, /a lot at once/);
  console.log("PASS rate limit");

  // Guardrail text is in the prompt.
  assert.match(seen[0].system, /Never about anyone's body/);
  assert.match(seen[0].system, /reply in the language of their latest message/i);
  console.log("agent OK");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
