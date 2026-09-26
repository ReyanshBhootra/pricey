// Person D: Pricey over text. One function, handleText, turns an incoming text into a reply.
// Used by /api/text (the Photon iMessage relay in bot/) and by the /text simulator page.
// Same data, vouching, and Gemini grounding as the app.

import { createHash } from "node:crypto";
import { addItem, getActiveEvents, getItems, getStores, submitReport } from "./data";
import { money, timeAgo } from "./format";
import { BOROUGH_PLACES, findPlace } from "./places";
import { generate, geminiEnabled, CHAT_MODELS } from "./gemini";
import { answerFromData, buildContext, matchItems, SYSTEM_PROMPT } from "./grounding";
import type { Borough, Item, Report, Store } from "./types";

export type TextAction = { subscribe: Borough | "all" } | { unsubscribe: true } | null;
export interface TextReply {
  reply: string;
  action: TextAction;
}

// Phone numbers never get stored: reports carry a one-way hash as the userId.
export const textUserId = (from: string) => `text-${createHash("sha256").update(from.trim().toLowerCase()).digest("hex").slice(0, 16)}`;

export const HELP = [
  "Pricey: real NYC food prices from real people.",
  "- Ask: how much are eggs in brooklyn?",
  "- Report: eggs 3.99 at key food park slope",
  "- Free food: free bagels at myrtle deli until 5pm",
  "- Deals near you: deals in queens",
  "- Alerts: alerts on brooklyn (stop to end)",
].join("\n");

const WORD = /[a-z0-9]+/g;
const words = (s: string) => (s.toLowerCase().replace(/&/g, " and ").replace(/'/g, "").match(WORD) ?? []).filter((w) => w.length > 1);
const GENERIC = new Set(["the", "and", "on", "of", "in", "at", "store", "market", "supermarket", "grocery", "deli", "nyc"]);

export function findBorough(text: string): Borough | null {
  const t = text.toLowerCase();
  if (/staten/.test(t)) return "Staten Island";
  if (/\bbk\b|brooklyn/.test(t)) return "Brooklyn";
  if (/\bbx\b|bronx/.test(t)) return "Bronx";
  if (/queens/.test(t)) return "Queens";
  if (/manhattan|\bnyc\b/.test(t)) return "Manhattan";
  return null;
}

// "key food park slope" -> Key Food Park Slope. Scores word overlap, ignoring generic words.
export function matchStore(text: string, stores: Store[]): { store: Store | null; suggestions: Store[] } {
  const q = new Set(words(text));
  const scored = stores
    .map((s) => {
      const w = words(`${s.name} ${s.borough}`);
      const specific = w.filter((x) => !GENERIC.has(x));
      const hits = w.filter((x) => q.has(x)).length;
      const specificHits = specific.filter((x) => q.has(x)).length;
      return { s, score: specificHits ? hits / w.length + specificHits : 0 };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return { store: null, suggestions: [] };
  const [best, second] = scored;
  const clear = !second || best.score - second.score >= 0.5;
  return { store: clear ? best.s : null, suggestions: scored.slice(0, 3).map((x) => x.s) };
}

// The price in "eggs 3.99 at ..." but not the 5 in "potatoes 5 lb". Prefers $ or cents.
export function findPrice(text: string): number | null {
  const found = [...text.matchAll(/(\$)?(\d{1,3}(?:\.\d{1,2})?)(?!\s*(?:lb|lbs|oz|ct|pk|pack|%|dozen|doz|gal|l\b|ml|am|pm|kg|g\b))/gi)].map((m) => ({
    value: Number(m[2]),
    strong: Boolean(m[1]) || m[2].includes("."),
  }));
  const pick = found.find((f) => f.strong) ?? (found.length === 1 ? found[0] : null);
  return pick && pick.value >= 0 && pick.value <= 1000 ? Math.round(pick.value * 100) / 100 : null;
}

// Split "free bagels at myrtle deli until 5pm" into what, where, and when.
function splitAt(text: string): { what: string; where: string; when: string } | null {
  const m = text.match(/^(.*?)\s+(?:at|@|from)\s+(.+)$/i);
  if (!m) return null;
  const when = m[2].match(/\b(until|till|til|today|tonight|now|right now|before|after)\b.*$/i)?.[0].trim() ?? "";
  const where = when ? m[2].slice(0, m[2].length - when.length).trim() : m[2].trim();
  return { what: m[1].trim(), where, when };
}

// "N spots near you have discounts right now" for a borough (or the whole city).
export async function dealsDigest(borough: Borough | null, sinceMs = 0): Promise<string | null> {
  const [events, stores, items] = await Promise.all([getActiveEvents({ hours: 24 }), getStores(), getItems()]);
  const storeById = new Map(stores.map((s) => [s.id, s]));
  const itemName = new Map(items.map((i) => [i.id, i.name]));
  const here = events.filter((e) => !borough || storeById.get(e.storeId)?.borough === borough);
  if (!here.length || !here.some((e) => e.timestamp > sinceMs)) return null;
  const spots = new Set(here.map((e) => e.storeId)).size;
  const where = borough ? ` in ${borough}` : " in NYC";
  const line = (e: Report) => `- ${storeById.get(e.storeId)?.name ?? e.storeId}: ${e.note ?? `${itemName.get(e.itemId) ?? "deal"} ${money(e.price)}`} (${timeAgo(e.timestamp)})`;
  return [`${spots} ${spots === 1 ? "spot" : "spots"}${where} ${spots === 1 ? "has" : "have"} discounts right now:`, ...here.slice(0, 5).map(line)].join("\n");
}

async function reportPrice(from: string, text: string, price: number): Promise<string> {
  const parts = splitAt(text);
  const [items, stores] = await Promise.all([getItems(), getStores()]);
  const itemText = parts?.what ?? text;
  const item = matchItems(itemText, items)[0];
  const { store, suggestions } = matchStore(parts?.where ?? text, stores);
  if (!item) return `I couldn't tell which item that was. Try like: eggs 3.99 at key food park slope`;
  if (!store) {
    return suggestions.length
      ? `Which store? Did you mean ${suggestions.map((s) => s.name).join(", or ")}? Send it again with the store name.`
      : `I don't know that store yet. Add it in the Pricey app, or try: ${item.name.toLowerCase()} ${price} at trader joes union square`;
  }
  const r = await submitReport({ itemId: item.id, storeId: store.id, price, userId: textUserId(from), type: "price" });
  const now = r.newPrice ?? price;
  if (r.priceChanged) return `Thanks! ${item.name} at ${store.name} is now ${money(now)} (was ${money(r.oldPrice!)}).`;
  if (r.oldPrice === null) return `Thanks! You're the first to report ${item.name} at ${store.name}: ${money(now)}.`;
  return now === price
    ? `Thanks! You agree with the trusted price for ${item.name} at ${store.name}: ${money(now)}.`
    : `Thanks, counted! Most people still say ${money(now)} for ${item.name} at ${store.name}.`;
}

async function reportDeal(from: string, text: string): Promise<string> {
  const body = text.replace(/^(deal|popup|pop-up|pop up|free food)\s*:?\s*/i, "");
  const parts = splitAt(body);
  if (!parts) return `Where is it? Try like: free bagels at myrtle deli until 5pm`;
  const [items, stores] = await Promise.all([getItems(), getStores()]);
  const { store, suggestions } = matchStore(parts.where, stores);
  if (!store) {
    return suggestions.length
      ? `Which spot? Did you mean ${suggestions.map((s) => s.name).join(", or ")}? Send it again with the store name.`
      : `I don't know that spot yet. Add it in the Pricey app first.`;
  }
  const free = /\bfree\b/i.test(body);
  // The store is shown next to the deal already, so the note is just what and when.
  const what = [parts.what, parts.when].filter(Boolean).join(" ");
  const note = await postDeal({ userId: textUserId(from), storeId: store.id, what, price: free ? 0 : (findPrice(body) ?? 0), items, itemHint: parts.what });
  return `Posted! People near ${store.name} will see: "${note}". Thanks for sharing.`;
}

// Free food / pop-up / discount: same reports pipeline, type "event". Used by texts and the app.
export async function postDeal(d: { userId: string; storeId: string; what: string; price: number; items?: Item[]; itemHint?: string }): Promise<string> {
  const items = d.items ?? (await getItems());
  const item = matchItems(d.itemHint ?? d.what, items)[0] ?? (await addItem({ name: "Other food or deal", category: "prepared food" }));
  const note = d.what.replace(/\s+/g, " ").trim().slice(0, 200);
  await submitReport({ itemId: item.id, storeId: d.storeId, price: Math.max(0, Math.round(d.price * 100) / 100), userId: d.userId, type: "event", note });
  return note;
}

const TEXT_PROMPT = `${SYSTEM_PROMPT}
- This is a text message. Reply in under 60 words. At most 3 list items. No links.
- Only quote a distance exactly as DATA gives it, including where it is measured from ("0.6 mi from 11215"). If DATA has no distances, don't make any up.`;

async function answerQuestion(text: string): Promise<string> {
  // A ZIP or neighborhood gives honest distances ("0.6 mi from 11215"); a borough alone is only for ranking.
  const place = findPlace(text);
  const borough = findBorough(text);
  const where = place ? { lat: place.lat, lng: place.lng, label: place.label } : borough ? { ...BOROUGH_PLACES[borough], approximate: true } : null;
  const ctx = await buildContext(text, where);
  if (geminiEnabled()) {
    try {
      const res = await generate(
        { contents: [{ role: "user", parts: [{ text }] }], config: { systemInstruction: `${TEXT_PROMPT}\n\nDATA:\n${ctx.text}`, temperature: 0.4 } },
        12000,
        { models: CHAT_MODELS, budgets: [0], startMs: 12000 },
      );
      const reply = res.text?.replace(/\*\*/g, "").trim();
      if (reply) return reply;
    } catch (e) {
      console.error("Gemini text reply failed, answering from data:", e instanceof Error ? e.message : e);
    }
  }
  return answerFromData(text, ctx);
}

export async function handleText(from: string, raw: string): Promise<TextReply> {
  const text = raw.replace(/\s+/g, " ").trim().slice(0, 500);
  const t = text.toLowerCase();
  const none = (reply: string): TextReply => ({ reply, action: null });

  if (!text || /^(help|hi|hey|hello|start|menu|\?)!?$/.test(t)) return none(HELP);

  if (/^(stop|unsubscribe|alerts? off|no more alerts)\b/.test(t)) {
    return { reply: "Alerts off. Text alerts on to turn them back on.", action: { unsubscribe: true } };
  }
  if (/^(alerts?|subscribe|notify me|alerts? on)\b/.test(t)) {
    const borough = findBorough(t);
    const where = borough ? ` in ${borough}` : " across NYC";
    return {
      reply: `Alerts on! I'll text you when free food or deals pop up${where}, bundled so it's one text. Text stop to end.`,
      action: { subscribe: borough ?? "all" },
    };
  }

  // Deals digest: "deals", "any free food in brooklyn?", "discounts near me".
  if (/\b(deals?|discounts?|free food|popups?|pop-ups?|pop ups?)\b/.test(t) && !/\bat\b|@/.test(t)) {
    const borough = findBorough(t);
    return none((await dealsDigest(borough)) ?? `No free food or deals reported${borough ? ` in ${borough}` : ""} in the last day. Seen one? Text: free bagels at myrtle deli`);
  }

  // Free food or a deal at a place: "free bagels at myrtle deli", "deal: $1 coffee at joe coffee".
  if (/^(deal|popup|pop-up|pop up|free food)\b|^free\b/.test(t) || (/\bfree\b/.test(t) && /\bat\b|@/.test(t))) {
    return none(await reportDeal(from, text));
  }

  // A price report: has a price and a place.
  const price = findPrice(text);
  if (price !== null && (/\bat\b|@/.test(t) || /^\D+\s\$?\d/.test(t)) && !/\?$/.test(t) && !/^(how|what|where|is|are|can|any)\b/.test(t)) {
    return none(await reportPrice(from, text, price));
  }

  return none(await answerQuestion(text));
}
