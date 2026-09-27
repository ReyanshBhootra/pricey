// Person D: Pricey over text. One function, handleText, turns an incoming text into a reply.
// Used by /api/text (the Photon iMessage relay in bot/) and by the /text simulator page.
// Same data, vouching, and Gemini grounding as the app.

import { addItem, getActiveEvents, getItems, getStores, submitReport } from "./data";
import { money, timeAgo } from "./format";
import { BOROUGH_PLACES, findPlace } from "./places";
import { generate, geminiEnabled, CHAT_MODELS } from "./gemini";
import { answerFromData, buildContext, matchItems, SYSTEM_PROMPT } from "./grounding";
import type { Borough, ChatTurn, Item, Report, Store, UserProfile } from "./types";

export type TextAction = { subscribe: Borough | "all" } | { unsubscribe: true } | null;
export interface TextReply {
  reply: string;
  action: TextAction; // for relays from before accounts; newer ones read alerts from the server
  react?: string | null; // tapback glyph on their message ("👍" after a save)
  contactCard?: boolean; // send Pricey's contact card (first message only)
  source?: "gemini" | "rules";
}

export interface Incoming {
  channel?: Channel;
  spaceId?: string; // iMessage conversation id, so Pricey can text them first later
  attachments?: { mimeType: string; data: Buffer; name?: string }[];
  model?: ModelCall; // tests swap Gemini for a scripted stand-in
  userId?: string; // already-known account (logged-in website user in the simulator)
}

// Kept for the relay and tests; the id itself comes from phone.ts.
import { phoneLast4, phoneUserId, phoneUserId as textUserId } from "./phone";
import { runAgent, type Channel, type ModelCall } from "./agent";
import { parseReceipt } from "./receipt";
import { getUser, saveUser } from "./data";
import { optimizeList, planText } from "./optimizer";
import { coordsFromText, placeFromCoords, placeFromZip } from "./places";
export { textUserId };

export const HELP = [
  "Pricey: real NYC food prices from real people.",
  "- Ask: how much are eggs in brooklyn?",
  "- Report: eggs 3.99 at key food park slope",
  "- Free food: free bagels at myrtle deli until 5pm",
  "- Deals near you: deals in queens",
  "- Plan a trip: list: eggs, milk, bread",
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

// Rule-based replies: the backup when Gemini is unavailable. Fixed commands, fixed wording.
export async function handleTextRules(from: string, raw: string): Promise<TextReply> {
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
    const reply = await reportDeal(from, text);
    return { reply, action: null, react: reply.startsWith("Posted") ? "👍" : null };
  }

  // A price report: has a price and a place.
  const price = findPrice(text);
  if (price !== null && (/\bat\b|@/.test(t) || /^\D+\s\$?\d/.test(t)) && !/\?$/.test(t) && !/^(how|what|where|is|are|can|any)\b/.test(t)) {
    const reply = await reportPrice(from, text, price);
    return { reply, action: null, react: reply.startsWith("Thanks") ? "👍" : null };
  }

  return none(await answerQuestion(text));
}

// Backup welcome for when Gemini is down (Gemini writes its own otherwise).
const welcome = (u: UserProfile) =>
  `Hey${u.firstName ? ` ${u.firstName}` : ""}! I'm Pricey. I keep track of what food really costs around NYC, thanks to people like you. Ask me how much something is, or tell me a price you just paid.${u.home ? "" : " What's your ZIP? I'll find stuff close by."}`;

const addTurn = (recent: ChatTurn[] | undefined, ...turns: ChatTurn[]) => [...(recent ?? []), ...turns].slice(-8);

// Every text from iMessage comes through here.
export async function handleText(from: string, raw: string, incoming: Incoming = {}): Promise<TextReply> {
  const channel = incoming.channel ?? "imessage";
  const id = incoming.userId ?? phoneUserId(from);
  const user: UserProfile = (await getUser(id)) ?? { id };
  const first = !user.welcomedAt;
  const now = Date.now();
  let text = raw.replace(/\s+/g, " ").trim().slice(0, 800);
  const patch: Partial<UserProfile> = {
    welcomedAt: user.welcomedAt ?? now,
    spaceId: incoming.spaceId ?? user.spaceId,
    phoneLast4: user.phoneLast4 ?? (channel === "imessage" ? phoneLast4(from) : undefined),
  };
  let note = "";

  // Gentle rate limit (20 texts a minute): protects the Gemini quota from runaway loops.
  const sentAt = [...(user.sentAt ?? []).filter((t) => now - t < 60_000), now];
  patch.sentAt = sentAt.slice(-20);
  if (sentAt.length > 20) {
    await saveUser(id, { sentAt: patch.sentAt });
    return { reply: "Whoa, that's a lot at once. Give me a sec and try again in a minute.", action: null };
  }

  for (const a of incoming.attachments ?? []) {
    // A shared location pin: remember it as home, with the nearest ZIP as its label.
    const coords = /vcard|text\/|location/i.test(a.mimeType) || /\.vcf$/i.test(a.name ?? "") ? coordsFromText(a.data.toString("utf8")) : null;
    const pin = coords && placeFromCoords(coords.lat, coords.lng);
    if (pin) {
      patch.home = { label: pin.label, lat: pin.lat, lng: pin.lng, borough: pin.borough };
      note += `[They shared a location pin. Saved as their home: near ${pin.label}, ${pin.borough}. Confirm briefly.]\n`;
      continue;
    }
    // A photo: read it as a receipt and hold it until they confirm.
    if (/^image\//.test(a.mimeType) && geminiEnabled()) {
      try {
        const r = await parseReceipt(a.data, a.mimeType);
        if (r.lines.length) {
          patch.pending = { kind: "receipt", storeId: r.storeId, storeName: r.storeName, storeAddress: r.storeAddress, subtotal: r.subtotal, total: r.total, lines: r.lines.map(({ name, price, itemId, category, raw }) => ({ name, price, itemId, category, raw })), at: now };
          note += `[They just sent a receipt photo. It's parsed and PENDING (see ABOUT THEM). Summarize it briefly: store, number of items, 3 or 4 example prices, and the total exactly as PENDING RECEIPT gives it (never add prices up yourself). ${r.storeId ? "" : "The store is new to Pricey: say so, and that it'll be added when they say yes. "}Ask them to reply yes to save, or tell you what to fix.]\n`;
        } else note += "[They sent a photo but it didn't look like a food receipt. Tell them kindly.]\n";
      } catch (e) {
        console.error("Receipt photo failed:", e instanceof Error ? e.message : e);
        note += "[They sent a photo but it couldn't be read right now. Ask them to try again in a bit.]\n";
      }
    }
  }
  if (!text) text = incoming.attachments?.length ? "(sent an attachment)" : "hi";

  let out: TextReply | null = null;
  if (geminiEnabled() || incoming.model) {
    try {
      const r = await runAgent({ user: { ...user, ...patch }, text, channel, firstMessage: first, note: note.trim() || undefined }, incoming.model);
      Object.assign(patch, r.patch);
      out = { reply: r.reply, react: r.react, action: legacyAction(r.patch), source: "gemini" };
    } catch (e) {
      console.error("Agent failed, using rules:", e instanceof Error ? e.message : e);
    }
  }
  if (!out && patch.home && !incoming.attachments?.every((a) => /^image\//.test(a.mimeType)) && (text === "(sent an attachment)" || !text.trim())) {
    // Location pin shared with no words: just confirm it.
    out = { reply: `Got it, I'll measure distances from near ${patch.home.label} (${patch.home.borough}). Ask me how much anything is!`, react: "👍", action: null };
  }
  if (!out) {
    const zip = text.match(/^\s*(?:home\s*|i'?m in\s*)?(1\d{4})\s*$/i)?.[1];
    const place = zip ? placeFromZip(zip) : null;
    if (place) {
      patch.home = { label: place.label, lat: place.lat, lng: place.lng, borough: place.borough };
      out = { reply: `Got it, ${place.label} (${place.borough}). I'll use that for distances. Ask me how much anything is!`, react: "👍", action: null };
    } else if (/^(?:shopping )?list\s*[:\-]?\s*\S/i.test(text)) {
      // "list: eggs, milk, bread" -> the cheapest sensible trip from their home.
      const names = text.replace(/^(?:shopping )?list\s*[:\-]?\s*/i, "").split(/,|\band\b|\n/);
      const h = patch.home ?? user.home;
      const r = await optimizeList(names, h ? { lat: h.lat, lng: h.lng, label: h.label, approximate: h.approximate } : null, (n, items) => matchItems(n, items)[0] ?? null);
      out = { reply: planText(r), action: null };
    } else if (first && /^(hi|hey|hello|yo|sup|start|help|\?)\W*$/i.test(text)) {
      out = { reply: welcome(user), action: null };
    } else {
      out = await handleTextRules(from, text);
      if (first) out.reply = `${welcome(user)}\n\n${out.reply}`;
    }
    out.source = "rules";
    if (out.action && "subscribe" in out.action) patch.alerts = { area: out.action.subscribe, since: now };
    if (out.action && "unsubscribe" in out.action) patch.alerts = null;
  }

  patch.recent = addTurn(user.recent, { role: "user", text: text.slice(0, 300), at: now }, { role: "pricey", text: out.reply.slice(0, 400), at: Date.now() });
  await saveUser(id, patch);
  // Photon shared lines share a card named "Spectrum", not Pricey, so it stays off unless a
  // dedicated line with our own name is set up (CONTACT_CARD=on in Vercel).
  return { ...out, contactCard: first && process.env.CONTACT_CARD === "on" };
}

// Older relays keep their own alert list; tell them when alerts change.
function legacyAction(p: Partial<UserProfile>): TextAction {
  if (p.alerts === null) return { unsubscribe: true };
  if (p.alerts) return { subscribe: p.alerts.area };
  return null;
}
