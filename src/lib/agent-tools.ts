// The actions Pricey's agent can take. Gemini decides WHICH to call and with what words;
// these functions do the real work against our data and return plain facts. Gemini never
// sees a price that didn't come from here, and can't claim a save that didn't happen.

import { addItem, addStore, ENDED, learnReceiptWords, createForumPost, getActiveEvents, getForumPosts, submitReport } from "./data";
import { money, timeAgo } from "./format";
import { byValue, cityIndex, distanceText, forgetCityCache, matchItems, toFact, type Located } from "./grounding";
import { describeChange, priceHistory } from "./history";
import { optimizeList, planForAgent } from "./optimizer";
import { BOROUGH_PLACES, findPlace, placeFromZip } from "./places";
import { endDeal, findBorough, matchStore, postDeal } from "./texting";
import { BOROUGHS, CATEGORIES, type Borough, type Category, type Item, type Store, type UserProfile } from "./types";
import { distanceKm } from "./vouch";

export interface ToolContext {
  user: UserProfile; // current profile (read)
  patch: Partial<UserProfile>; // changes to save after the turn
  wrote: boolean; // something was saved/posted/tracked: earns a 👍 tapback
}

type Args = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[$,\s]/g, "")) : NaN);

const home = (ctx: ToolContext) => ({ ...ctx.user, ...ctx.patch }).home;

// Where to measure from: a place they just named, else their saved home, else nowhere.
function resolveWhere(place: string, ctx: ToolContext): Located | null {
  if (place) {
    const p = findPlace(place);
    if (p) return { lat: p.lat, lng: p.lng, label: p.label };
    const b = findBorough(place);
    if (b) return { ...BOROUGH_PLACES[b], approximate: true };
  }
  const h = home(ctx);
  return h ? { lat: h.lat, lng: h.lng, label: h.label, approximate: h.approximate } : null;
}

function resolveItem(name: string, items: Item[]): Item | null {
  const n = name.toLowerCase();
  return items.find((i) => i.name.toLowerCase() === n || i.id === n) ?? matchItems(name, items)[0] ?? null;
}

// "key food" is three stores; if one is clearly closest to their home, that's the one they mean.
function resolveStore(name: string, stores: Store[], ctx: ToolContext): { store: Store | null; suggestions: Store[] } {
  const r = matchStore(name, stores);
  if (r.store || r.suggestions.length < 2) return r;
  const h = home(ctx);
  if (h && !h.approximate) {
    const [a, b] = r.suggestions.map((s) => ({ s, d: distanceKm(h.lat, h.lng, s.lat, s.lng) })).sort((x, y) => x.d - y.d);
    if (a.d < 1.6 && b.d > a.d * 2) return { store: a.s, suggestions: r.suggestions };
  }
  return r;
}

function boroughFrom(text: string, ctx: ToolContext): Borough | null {
  return findBorough(text) ?? findPlace(text)?.borough ?? (BOROUGHS as readonly string[]).find((b) => b.toLowerCase() === text.toLowerCase()) as Borough ?? home(ctx)?.borough ?? null;
}

const placeName = (w: Located | null) => (w ? (w.approximate ? `${w.label} (borough only, no distances)` : w.label ?? "you") : null);

export const TOOLS = {
  lookup_prices: {
    description: "Current trusted prices for one or more grocery or food items, best value first. Use for any 'how much is X' or 'where is X cheapest' question.",
    parameters: {
      type: "object",
      properties: {
        items: { type: "array", items: { type: "string" }, description: "Item names as the person said them, e.g. ['eggs', 'oat milk']" },
        place: { type: "string", description: "ZIP, neighborhood, or borough they mentioned for THIS question. Leave empty to use their saved home." },
      },
      required: ["items"],
    },
    async run(a: Args, ctx: ToolContext) {
      const { items, storeById, pricesFor } = await cityIndex();
      const where = resolveWhere(str(a.place), ctx);
      const names = (Array.isArray(a.items) ? a.items : []).map(str).filter(Boolean).slice(0, 6);
      const results = [];
      const unknown = [];
      for (const n of names) {
        const item = resolveItem(n, items);
        if (!item) {
          unknown.push(n);
          continue;
        }
        const facts = pricesFor(item.id).map((p) => toFact(p, storeById, where)).sort(byValue).slice(0, 5);
        const trend = describeChange((await priceHistory(item.id)).changePct);
        results.push({
          item: item.name,
          city_trend: trend ?? undefined,
          prices: facts.map((f) => ({
            price: money(f.price),
            store: f.storeName,
            borough: f.borough,
            distance: f.distanceKm !== null ? distanceText(f.distanceKm, where) : undefined,
            agree: f.estimated ? "Pricey's estimate, nobody has confirmed it yet" : `${f.votes} of ${f.totalReports} reporters`,
            updated: timeAgo(f.lastReportedAt),
          })),
        });
      }
      return { measured_from: placeName(where), results, not_tracked_yet: unknown, known_items: unknown.length ? items.map((i) => i.name) : undefined };
    },
  },

  shopping_list: {
    description: "Plan the cheapest sensible trip for a whole shopping list near them. Counts walking vs a $2.90 subway ride and only suggests a second store when it's close by and really saves money. Use for 'where should I buy eggs, milk and bread' or any list of 2+ items.",
    parameters: {
      type: "object",
      properties: {
        items: { type: "array", items: { type: "string" }, description: "Everything on their list, as they said it" },
        place: { type: "string", description: "ZIP, neighborhood, or borough for THIS list. Leave empty to use their saved home." },
      },
      required: ["items"],
    },
    async run(a: Args, ctx: ToolContext) {
      const names = (Array.isArray(a.items) ? a.items : []).map(str).filter(Boolean);
      const where = resolveWhere(str(a.place), ctx);
      const r = await optimizeList(names, where, resolveItem);
      return { ...planForAgent(r), tip: where ? undefined : "No location yet: ask for their ZIP so distances and fares are real." };
    },
  },

  store_prices: {
    description: "Everything Pricey knows about one store: trusted prices and deals there right now.",
    parameters: { type: "object", properties: { store: { type: "string" } }, required: ["store"] },
    async run(a: Args, ctx: ToolContext) {
      const { stores, items, pricesFor, itemById } = await cityIndex();
      const { store, suggestions } = resolveStore(str(a.store), stores, ctx);
      if (!store) return { error: suggestions.length ? "which_store" : "unknown_store", did_you_mean: suggestions.map((s) => s.name) };
      const prices = items
        .map((i) => ({ i, p: pricesFor(i.id).find((p) => p.storeId === store.id) }))
        .filter((x) => x.p)
        .map((x) => ({ item: x.i.name, price: money(x.p!.price), agree: x.p!.estimated ? "estimate, unconfirmed" : x.p!.votes, updated: timeAgo(x.p!.lastReportedAt) }));
      const deals = (await getActiveEvents({ hours: 24 })).filter((e) => e.storeId === store.id).map((e) => e.note ?? itemById.get(e.itemId)?.name);
      const where = resolveWhere("", ctx);
      return {
        store: store.name,
        borough: store.borough,
        distance: where && !where.approximate ? distanceText(distanceKm(where.lat, where.lng, store.lat, store.lng), where) : undefined,
        prices,
        deals_now: deals,
      };
    },
  },

  report_price: {
    description: "Save a price the person paid or saw. Only call when they clearly state an item, a store, and a price.",
    parameters: {
      type: "object",
      properties: {
        item: { type: "string" },
        store: { type: "string" },
        price: { type: "number", description: "Dollars, e.g. 3.99" },
        new_item_category: { type: "string", enum: [...CATEGORIES], description: "Only if the item isn't one Pricey tracks yet and they want to add it" },
      },
      required: ["item", "store", "price"],
    },
    async run(a: Args, ctx: ToolContext) {
      const price = num(a.price);
      if (!Number.isFinite(price) || price < 0 || price > 1000) return { error: "bad_price" };
      const { items, stores } = await cityIndex();
      let item = resolveItem(str(a.item), items);
      const cat = str(a.new_item_category) as Category;
      if (!item && CATEGORIES.includes(cat)) item = await addItem({ name: str(a.item).slice(0, 80), category: cat });
      if (!item) return { error: "unknown_item", known_items: items.map((i) => i.name), hint: "Ask which item they mean, or offer to add it as a new item (then call again with new_item_category)." };
      const { store, suggestions } = resolveStore(str(a.store), stores, ctx);
      if (!store) return { error: suggestions.length ? "which_store" : "unknown_store", did_you_mean: suggestions.map((s) => s.name), hint: suggestions.length ? "Ask which one." : "Say they can add the store in the Pricey app." };
      const r = await submitReport({ itemId: item.id, storeId: store.id, price: Math.round(price * 100) / 100, userId: ctx.user.id, type: "price" });
      forgetCityCache();
      ctx.wrote = true;
      return {
        saved: true,
        item: item.name,
        store: store.name,
        their_price: money(r.report.price),
        trusted_price_now: r.newPrice !== null ? money(r.newPrice) : undefined,
        first_report_here: r.oldPrice === null,
        moved_trusted_price_from: r.priceChanged ? money(r.oldPrice!) : undefined,
        agrees_with_most: r.newPrice === r.report.price,
      };
    },
  },

  post_deal: {
    description: "Share free food, a pop-up, or a discount happening at a place. Price 0 or empty means free.",
    parameters: {
      type: "object",
      properties: { what: { type: "string", description: "Short description with timing, e.g. 'free bagels until 5pm'" }, store: { type: "string" }, price: { type: "number" } },
      required: ["what", "store"],
    },
    async run(a: Args, ctx: ToolContext) {
      const { stores } = await cityIndex();
      const { store, suggestions } = resolveStore(str(a.store), stores, ctx);
      if (!store) return { error: suggestions.length ? "which_store" : "unknown_store", did_you_mean: suggestions.map((s) => s.name) };
      const price = num(a.price);
      const note = await postDeal({ userId: ctx.user.id, storeId: store.id, what: str(a.what), price: Number.isFinite(price) ? price : 0 });
      ctx.wrote = true;
      if (note.startsWith(ENDED)) return { deal_ended: true, store: store.name, hint: "It said the deal is over, so the store's deals were taken off the list." };
      return { posted: true, store: store.name, note };
    },
  },

  end_deal: {
    description: "Someone says a deal, pop-up, or free food is over, sold out, or gone. Takes that store's deals off the list. Never use post_deal for this.",
    parameters: { type: "object", properties: { store: { type: "string" }, what: { type: "string", description: "What they said, e.g. 'halal cart deal is over'" } }, required: ["store"] },
    async run(a: Args, ctx: ToolContext) {
      const { stores } = await cityIndex();
      const { store, suggestions } = resolveStore(str(a.store), stores, ctx);
      if (!store) return { error: suggestions.length ? "which_store" : "unknown_store", did_you_mean: suggestions.map((s) => s.name) };
      await endDeal({ userId: ctx.user.id, storeId: store.id, what: str(a.what) || "deal is over" });
      forgetCityCache();
      ctx.wrote = true;
      return { deal_ended: true, store: store.name };
    },
  },

  get_deals: {
    description: "Free food, pop-ups, and discounts happening now (last 24 hours), closest first.",
    parameters: { type: "object", properties: { place: { type: "string", description: "ZIP, neighborhood, or borough. Empty = their home, or all of NYC." } } },
    async run(a: Args, ctx: ToolContext) {
      const { storeById, itemById } = await cityIndex();
      const where = resolveWhere(str(a.place), ctx);
      const events = await getActiveEvents({ hours: 24 });
      const withDist = events
        .map((e) => {
          const s = storeById.get(e.storeId);
          return { e, s, d: s && where ? distanceKm(where.lat, where.lng, s.lat, s.lng) : null };
        })
        .filter((x) => !where || !x.s || (where.approximate ? x.s.borough === findBorough(where.label ?? "") : (x.d ?? 0) <= 5))
        .sort((x, y) => (x.d ?? 0) - (y.d ?? 0))
        .slice(0, 6);
      return {
        measured_from: placeName(where),
        spots: new Set(withDist.map((x) => x.e.storeId)).size,
        deals: withDist.map((x) => ({
          store: x.s?.name,
          what: x.e.note ?? itemById.get(x.e.itemId)?.name,
          price: x.e.price === 0 ? "free" : money(x.e.price),
          distance: x.d !== null && where && !where.approximate ? distanceText(x.d, where) : undefined,
          posted: timeAgo(x.e.timestamp),
        })),
      };
    },
  },

  set_home: {
    description: "Remember where the person is based (ZIP or neighborhood) so answers can use real distances.",
    parameters: { type: "object", properties: { place: { type: "string", description: "ZIP code or neighborhood" } }, required: ["place"] },
    async run(a: Args, ctx: ToolContext) {
      const text = str(a.place);
      const p = placeFromZip(text) ?? findPlace(text);
      if (p) {
        ctx.patch.home = { label: p.label, lat: p.lat, lng: p.lng, borough: p.borough };
        ctx.wrote = true;
        return { saved: true, home: p.label, borough: p.borough };
      }
      const b = findBorough(text);
      if (b) {
        ctx.patch.home = { ...BOROUGH_PLACES[b], approximate: true };
        ctx.wrote = true;
        return { saved: true, home: b, note: "Borough only. Ask (once, lightly) for their ZIP to get exact distances." };
      }
      return { error: "unknown_place", hint: "Ask for their 5-digit ZIP code." };
    },
  },

  set_name: {
    description: "Remember the person's name when they tell you.",
    parameters: { type: "object", properties: { first_name: { type: "string" }, last_name: { type: "string" } }, required: ["first_name"] },
    async run(a: Args, ctx: ToolContext) {
      const first = str(a.first_name).slice(0, 40);
      if (!first) return { error: "no_name" };
      ctx.patch.firstName = first;
      if (str(a.last_name)) ctx.patch.lastName = str(a.last_name).slice(0, 40);
      return { saved: true, first_name: first };
    },
  },

  forum_read: {
    description: "Latest posts in a borough's community forum.",
    parameters: { type: "object", properties: { borough: { type: "string", description: "Borough, neighborhood, or ZIP. Empty = their home borough." } } },
    async run(a: Args, ctx: ToolContext) {
      const b = boroughFrom(str(a.borough), ctx);
      if (!b) return { error: "which_borough", boroughs: BOROUGHS };
      const posts = (await getForumPosts(b)).slice(0, 5);
      return { borough: b, posts: posts.map((p) => ({ text: p.text, posted: timeAgo(p.timestamp) })) };
    },
  },

  forum_post: {
    description: "Post to a borough's community forum. Only when the person explicitly asks to post something.",
    parameters: {
      type: "object",
      properties: { borough: { type: "string" }, text: { type: "string", description: "Their post, in their words" } },
      required: ["text"],
    },
    async run(a: Args, ctx: ToolContext) {
      const b = boroughFrom(str(a.borough), ctx);
      if (!b) return { error: "which_borough", boroughs: BOROUGHS };
      const text = str(a.text).slice(0, 500);
      if (!text) return { error: "empty_post" };
      await createForumPost({ borough: b, text, userId: ctx.user.id });
      ctx.wrote = true;
      return { posted: true, borough: b };
    },
  },

  track_item: {
    description: "Start or stop tracking an item's price; Pricey texts them when its trusted price changes.",
    parameters: { type: "object", properties: { item: { type: "string" }, on: { type: "boolean" } }, required: ["item", "on"] },
    async run(a: Args, ctx: ToolContext) {
      const { items } = await cityIndex();
      const item = resolveItem(str(a.item), items);
      if (!item) return { error: "unknown_item", known_items: items.map((i) => i.name) };
      const list = new Set(ctx.patch.tracked ?? ctx.user.tracked ?? []);
      if (a.on === false) list.delete(item.id);
      else list.add(item.id);
      ctx.patch.tracked = [...list];
      ctx.patch.lastChangeSeenAt ??= Date.now();
      ctx.wrote = true;
      return { tracking: a.on !== false, item: item.name, now_tracking: [...list].map((id) => items.find((i) => i.id === id)?.name ?? id) };
    },
  },

  set_alerts: {
    description: "Turn bundled free-food and deal alerts on or off. One text now and then with everything nearby, never spam.",
    parameters: { type: "object", properties: { on: { type: "boolean" }, area: { type: "string", description: "Borough, neighborhood, or ZIP. Empty = their home borough, or all NYC." } }, required: ["on"] },
    async run(a: Args, ctx: ToolContext) {
      if (a.on === false) {
        ctx.patch.alerts = null;
        ctx.wrote = true;
        return { alerts: "off" };
      }
      const area = boroughFrom(str(a.area), ctx) ?? "all";
      ctx.patch.alerts = { area, since: Date.now() };
      ctx.wrote = true;
      return { alerts: "on", area: area === "all" ? "all of NYC" : area };
    },
  },

  receipt_save: {
    description: "Save the pending receipt's prices after the person confirms. Apply any removals or fixes they asked for.",
    parameters: {
      type: "object",
      properties: {
        remove: { type: "array", items: { type: "string" }, description: "Line names to drop" },
        fixes: { type: "array", items: { type: "object", properties: { name: { type: "string" }, price: { type: "number" } }, required: ["name", "price"] } },
        store: { type: "string", description: "Only if they correct which store it was" },
        borough: { type: "string", enum: [...BOROUGHS], description: "Only when adding a new store and the tool asked which borough" },
      },
    },
    async run(a: Args, ctx: ToolContext) {
      const pending = ctx.user.pending;
      if (!pending || pending.kind !== "receipt") return { error: "no_pending_receipt" };
      const { stores, items } = await cityIndex();
      let storeId = pending.storeId;
      let newStore = false;
      if (str(a.store) || !storeId) {
        const { store, suggestions } = resolveStore(str(a.store) || pending.storeName, stores, ctx);
        if (store) storeId = store.id;
        else if (suggestions.length > 1) return { error: "which_store", did_you_mean: suggestions.map((s) => s.name), hint: "Ask which of these it is." };
        else {
          // A store Pricey doesn't know yet: add it, placed by the ZIP printed on the receipt.
          const name = str(a.store) || pending.storeName;
          const place = findPlace(pending.storeAddress ?? "");
          const borough = place?.borough ?? (BOROUGHS.includes(str(a.borough) as Borough) ? (str(a.borough) as Borough) : null);
          if (!name) return { error: "which_store", hint: "Ask the store's name." };
          if (!borough) return { error: "which_borough", hint: `Ask which borough ${name} is in.` };
          const spot = place ?? BOROUGH_PLACES[borough];
          storeId = (await addStore({ name, borough, lat: spot.lat, lng: spot.lng })).id;
          newStore = true;
        }
      }
      const drop = new Set((Array.isArray(a.remove) ? a.remove : []).map((r) => str(r).toLowerCase()));
      const fixes = Array.isArray(a.fixes) ? (a.fixes as Args[]) : [];
      let saved = 0;
      const learned: { raw: string; itemId: string }[] = [];
      for (const line of pending.lines) {
        if ([...drop].some((d) => line.name.toLowerCase().includes(d) || d.includes(line.name.toLowerCase()))) continue;
        const fix = fixes.find((f) => line.name.toLowerCase().includes(str(f.name).toLowerCase()));
        const price = fix ? num(fix.price) : line.price;
        if (!Number.isFinite(price) || price < 0) continue;
        const itemId = line.itemId ?? (await addItem({ name: line.name, category: line.category })).id;
        await submitReport({ itemId, storeId, price, userId: ctx.user.id, type: "price" });
        learned.push({ raw: line.raw, itemId });
        saved++;
      }
      // Confirmed lines teach the receipt dictionary (never blocks the save).
      await learnReceiptWords(learned).catch(() => {});
      forgetCityCache();
      ctx.patch.pending = null;
      ctx.wrote = true;
      void items;
      return { saved_prices: saved, store: stores.find((s) => s.id === storeId)?.name ?? pending.storeName, new_store_added: newStore || undefined };
    },
  },

  receipt_discard: {
    description: "Throw away the pending receipt without saving (they said no, or it's wrong).",
    parameters: { type: "object", properties: {} },
    async run(_a: Args, ctx: ToolContext) {
      ctx.patch.pending = null;
      return { discarded: true };
    },
  },

  checkin_reply: {
    description: "Answer Pricey's 'is this price still right?' check-in.",
    parameters: { type: "object", properties: { still_correct: { type: "boolean" }, new_price: { type: "number" } }, required: ["still_correct"] },
    async run(a: Args, ctx: ToolContext) {
      const p = ctx.user.pending;
      if (!p || p.kind !== "checkin") return { error: "no_pending_checkin" };
      const price = a.still_correct === false ? num(a.new_price) : p.price;
      if (!Number.isFinite(price) || price < 0 || price > 1000) return { error: "need_new_price", hint: "Ask what the price is now." };
      const r = await submitReport({ itemId: p.itemId, storeId: p.storeId, price, userId: ctx.user.id, type: "price" });
      forgetCityCache();
      ctx.patch.pending = null;
      ctx.wrote = true;
      return { saved: true, their_price: money(price), trusted_price_now: r.newPrice !== null ? money(r.newPrice) : undefined };
    },
  },
} satisfies Record<string, { description: string; parameters: object; run: (a: Args, ctx: ToolContext) => Promise<unknown> }>;

export type ToolName = keyof typeof TOOLS;

export const toolDeclarations = (names: ToolName[] = Object.keys(TOOLS) as ToolName[]) =>
  names.map((name) => ({ name, description: TOOLS[name].description, parametersJsonSchema: TOOLS[name].parameters }));

export async function runTool(name: string, args: Args, ctx: ToolContext): Promise<unknown> {
  const tool = (TOOLS as Record<string, { run: (a: Args, c: ToolContext) => Promise<unknown> }>)[name];
  if (!tool) return { error: "unknown_tool" };
  try {
    return await tool.run(args ?? {}, ctx);
  } catch (e) {
    console.error(`Tool ${name} failed:`, e);
    return { error: "something_went_wrong", hint: "Apologize briefly and suggest trying again." };
  }
}
