// Grounding: turn a question into a compact fact sheet from our own data, so Gemini
// answers from real reported prices instead of guessing. Shared by the chat (C) and
// Photon texting (D): call buildContext, pass `text` to Gemini, or use `answerFromData`
// when Gemini is unavailable.

import { getActiveEvents, getAllReports, getItems, getNearbyStores, getStores } from "./data";
import { km, money, timeAgo } from "./format";
import type { Item, Report, Store, TrustedPrice } from "./types";
import { distanceKm, trustedPricesByStore } from "./vouch";

export interface Located {
  lat: number;
  lng: number;
}

export interface PriceFact extends TrustedPrice {
  storeName: string;
  borough: string;
  distanceKm: number | null;
}

export interface Context {
  text: string;
  mentioned: { item: Item; prices: PriceFact[] }[];
  cheapest: { item: Item; best: PriceFact }[];
  events: (Report & { storeName: string; itemName: string })[];
  located: boolean;
}

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .split(/[^a-z]+/)
    .filter((w) => w.length > 2)
    .map((w) => w.replace(/(es|s)$/, ""));

const STOP = new Set(["the", "and", "for", "can", "how", "much", "are", "near", "what", "cheap", "cook", "price", "cost", "buy", "get", "any", "right", "now", "today", "where", "with", "under", "meal", "food", "free", "deal", "store", "best", "lowest", "cheapest"].map((w) => w.replace(/(es|s)$/, "")));

// Items the question is about: "how much are eggs" -> Eggs (dozen).
export function matchItems(question: string, items: Item[]): Item[] {
  const q = new Set(words(question).filter((w) => !STOP.has(w)));
  if (!q.size) return [];
  // Score = share of the item's name the question covers. "eggs" fully covers "Eggs (dozen)"
  // but only a third of "Bacon egg and cheese", so the weak match is dropped.
  const scored = items
    .map((i) => {
      const w = words(i.name);
      return { i, score: w.filter((x) => q.has(x)).length / w.length };
    })
    .filter((x) => x.score > 0);
  const best = Math.max(0, ...scored.map((x) => x.score));
  return scored.filter((x) => x.score >= best / 2).sort((a, b) => b.score - a.score).map((x) => x.i);
}

// Items, stores, and every report, cached for 15 seconds per server instance.
let city: { at: number; data: Promise<[Item[], Store[], Report[]]> } | null = null;
function cityData() {
  if (!city || Date.now() - city.at > 15000) {
    const data = Promise.all([getItems(), getStores(), getAllReports()]);
    city = { at: Date.now(), data };
    data.catch(() => (city = null)); // don't cache a failure
  }
  return city.data;
}

export async function buildContext(question: string, where?: Located | null): Promise<Context> {
  const [[items, stores, reports], events] = await Promise.all([
    cityData(),
    getActiveEvents({ hours: 24, ...(where ? { lat: where.lat, lng: where.lng, radiusKm: 5 } : {}) }),
  ]);
  const storeById = new Map(stores.map((s) => [s.id, s]));
  const itemById = new Map(items.map((i) => [i.id, i]));

  // Trusted price per store for every item, cheapest first, from one read.
  const byItem = new Map<string, Report[]>();
  for (const r of reports) if (r.type === "price") byItem.set(r.itemId, [...(byItem.get(r.itemId) ?? []), r]);
  const pricesFor = (id: string) => trustedPricesByStore(byItem.get(id) ?? []).sort((a, b) => a.price - b.price);

  const fact = (p: TrustedPrice): PriceFact => {
    const s = storeById.get(p.storeId) as Store | undefined;
    return {
      ...p,
      storeName: s?.name ?? p.storeId,
      borough: s?.borough ?? "",
      distanceKm: s && where ? distanceKm(where.lat, where.lng, s.lat, s.lng) : null,
    };
  };
  // Near the user, cheaper wins; far away stores only count if much cheaper.
  const rank = (a: PriceFact, b: PriceFact) =>
    a.price + (a.distanceKm ?? 0) * 0.15 - (b.price + (b.distanceKm ?? 0) * 0.15);

  const mentioned = matchItems(question, items)
    .slice(0, 5)
    .map((item) => ({ item, prices: pricesFor(item.id).map(fact).sort(rank).slice(0, 8) }));

  // Cheapest known price for every item, near the user when we know where they are.
  const nearbyIds = where ? new Set((await getNearbyStores(where.lat, where.lng, 5)).map((s) => s.id)) : null;
  const cheapest = items
    .map((item) => {
      const prices = pricesFor(item.id);
      const pool = nearbyIds && prices.some((p) => nearbyIds.has(p.storeId)) ? prices.filter((p) => nearbyIds.has(p.storeId)) : prices;
      return pool.length ? { item, best: fact(pool[0]) } : null;
    })
    .filter((x): x is { item: Item; best: PriceFact } => x !== null);

  const ev = events.slice(0, 10).map((e) => ({
    ...e,
    storeName: storeById.get(e.storeId)?.name ?? e.storeId,
    itemName: itemById.get(e.itemId)?.name ?? e.itemId,
  }));

  const line = (p: PriceFact) =>
    `${money(p.price)} at ${p.storeName} (${p.borough}${p.distanceKm !== null ? `, ${km(p.distanceKm)} away` : ""}; ${p.votes} of ${p.totalReports} reporters agree; updated ${timeAgo(p.lastReportedAt)})`;

  const text = [
    `Today: ${new Date().toDateString()}. City: New York City.`,
    where ? `User location: lat ${where.lat.toFixed(3)}, lng ${where.lng.toFixed(3)}.` : "User location: unknown, answer city-wide.",
    "",
    mentioned.length ? "PRICES FOR ITEMS IN THE QUESTION (best value first):" : "No specific item from our list was named in the question.",
    ...mentioned.flatMap(({ item, prices }) => [`${item.name} [${item.category}]:`, ...(prices.length ? prices.map((p) => `  - ${line(p)}`) : ["  - no reports yet"])]),
    "",
    `CHEAPEST KNOWN PRICE PER ITEM${where ? " NEAR THE USER" : ""}:`,
    ...cheapest.map(({ item, best }) => `- ${item.name} [${item.category}]: ${line(best)}`),
    "",
    "FREE FOOD AND DEALS RIGHT NOW:",
    ...(ev.length ? ev.map((e) => `- ${e.storeName}: ${e.note ?? `${e.itemName} for ${money(e.price)}`} (${timeAgo(e.timestamp)})`) : ["- none reported"]),
  ].join("\n");

  return { text, mentioned, cheapest, events: ev, located: Boolean(where) };
}

export const SYSTEM_PROMPT = `You are Pricey, a friendly assistant for grocery and food prices in New York City.
Answer ONLY from the DATA block. Prices there are real reports from New Yorkers, vouched by majority.
Rules:
- Quote exact prices and store names from DATA. Never invent a store, item, or price.
- If DATA has nothing for what was asked, say nobody has reported it yet and suggest reporting it on Pricey.
- For "near me" questions, prefer closer stores and mention the distance when you have it.
- For meal or cooking questions: ingredients or tools the user says they already have (for example paneer, an air fryer) can be used freely, and you may give simple cooking steps from general knowledge. Anything they would need to BUY must come from DATA with its price and store; give the total of what to buy. If a needed ingredient is not in DATA, say nobody has reported its price yet.
- Mention free food or deals from DATA when relevant.
- Keep it short: under 120 words, 2 to 6 sentences or a short list. Plain text, no markdown headings or bold. Use "- " for list items.
- If asked about something unrelated to food prices in NYC, briefly steer back.`;

// No Gemini (no key, outage, quota)? Still give a useful, grounded answer.
// `question` is the latest message; ctx may also carry items from earlier questions.
export function answerFromData(question: string, ctx: Context): string {
  const q = question.toLowerCase();
  const where = ctx.located ? " near you" : "";
  const named = new Set(matchItems(question, ctx.mentioned.map((m) => m.item)).map((i) => i.id));

  const priceAnswer = (list: Context["mentioned"]) =>
    list
      .map(({ item, prices }) => {
        if (!prices.length) return `Nobody has reported ${item.name} yet. Add a price on Pricey!`;
        const close = prices.filter((p) => p.distanceKm !== null && p.distanceKm <= 5);
        const top = (close.length ? close : prices)
          .slice()
          .sort((a, b) => a.price - b.price)
          .slice(0, 3).map((p) => `${money(p.price)} at ${p.storeName}${p.distanceKm !== null ? ` (${km(p.distanceKm)})` : ""}`);
        return `${item.name}${where}: ${top.join(", ")}.`;
      })
      .join("\n");

  // 1. The latest question names an item: answer that.
  if (named.size) return priceAnswer(ctx.mentioned.filter((m) => named.has(m.item.id)));

  if (/free|deal|discount|pop.?up/.test(q)) {
    if (!ctx.events.length) return `No free food or deals reported${where} in the last day.`;
    return [`${ctx.events.length} ${ctx.events.length === 1 ? "deal" : "deals"}${where} right now:`, ...ctx.events.slice(0, 5).map((e) => `- ${e.storeName}: ${e.note ?? `${e.itemName} for ${money(e.price)}`}`)].join("\n");
  }

  if (/cook|meal|dinner|lunch|breakfast|recipe|budget|eat|make|hungry|snack/.test(q)) {
    const budget = Number(q.match(/\$\s?(\d+(?:\.\d+)?)/)?.[1] ?? q.match(/(\d+)\s*(?:dollars|bucks)/)?.[1] ?? 15);
    const staples = ["pasta-1lb", "black-beans-can", "onions-3lb", "eggs-dozen", "rice-5lb", "bread-loaf", "bananas-lb", "chicken-thighs-lb"];
    const meal: Context["cheapest"] = [];
    let total = 0;
    for (const id of staples) {
      const c = ctx.cheapest.find((x) => x.item.id === id);
      if (c && total + c.best.price <= budget && meal.length < 4) {
        meal.push(c);
        total += c.best.price;
      }
    }
    if (meal.length < 2) return `Not enough reported prices to plan a meal under ${money(budget)} yet. Add a few on Pricey!`;
    return [
      `A cheap meal for under ${money(budget)}${where}, from reported prices:`,
      ...meal.map((m) => `- ${m.item.name}: ${money(m.best.price)} at ${m.best.storeName}`),
      `Total: ${money(total)}, enough for a few filling servings.`,
    ].join("\n");
  }

  // 2. A follow-up like "is that the cheapest?": reuse the items from earlier questions.
  if (ctx.mentioned.length) return priceAnswer(ctx.mentioned);

  return "I can look up real prices people reported. Try: \"how much are eggs near me\", \"any free food right now\", or \"what can I cook for under $10\".";
}
