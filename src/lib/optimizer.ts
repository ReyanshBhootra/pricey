// Shopping list optimizer: the cheapest sensible way to buy a list near someone, counting what
// real life costs. Walking up to ~15 minutes is free; farther means the subway or bus, $2.90
// each way. A second store is only suggested when it's close to the first (or to you) and
// really saves money, never "ride 7 miles to save $2".
import { cityIndex, type Located } from "./grounding";
import { BOROUGH_CENTERS, kmToMiles, miles, money, walkMinutes } from "./format";
import type { Borough, Item, Store } from "./types";
import { distanceKm } from "./vouch";

export const FARE = 2.9; // NYC subway / bus, each way
const WALKABLE_MI = 0.75; // about 15 minutes on foot
const NEARBY_MI = 3; // don't consider stores farther than this when we know where you are
const PAIR_MI = 0.5; // a second stop must be this close to the first store or to you
const MIN_SAVINGS = 3; // a second stop has to save at least this much, after fares
const TIME_VALUE = 0.1; // $ per minute of travel, so a long walk to save 50 cents doesn't win
const TRANSIT_MIN = 20; // rough one-way subway or bus trip, door to door

export interface Stop {
  store: Store;
  items: { item: Item; price: number; estimated?: boolean }[];
  subtotal: number;
  miles: number | null;
  distance: string | null; // "0.6 mi", or feet when it's right there
  walkMin: number | null;
  fare: number; // round trip, 0 if walkable
}

export interface Plan {
  stops: Stop[];
  total: number; // groceries + fares
  groceries: number;
  missing: Item[]; // nobody has reported these near you
  score: number; // for ranking: total + unreported items at the city's typical price + travel time
}

export interface ShoppingResult {
  items: Item[];
  unknown: string[];
  best: Plan | null;
  split: (Plan & { saves: number }) | null; // two stops, only when truly worth it
  where: Located | null;
}

const round = (n: number) => Math.round(n * 100) / 100;
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

export async function optimizeList(names: string[], where: Located | null, match: (name: string, items: Item[]) => Item | null): Promise<ShoppingResult> {
  const { items, stores, pricesFor } = await cityIndex();
  const wanted: Item[] = [];
  const unknown: string[] = [];
  for (const n of names.map((x) => x.trim()).filter(Boolean).slice(0, 15)) {
    const it = match(n, items);
    if (it && !wanted.some((w) => w.id === it.id)) wanted.push(it);
    else if (!it) unknown.push(n);
  }
  if (!wanted.length) return { items: [], unknown, best: null, split: null, where };

  const exact = where && !where.approximate ? where : null;
  const mi = (s: Store) => (exact ? kmToMiles(distanceKm(exact.lat, exact.lng, s.lat, s.lng)) : null);
  // Only a borough known: stay in that borough. Nothing known: the whole city.
  const borough = where?.approximate
    ? (Object.entries(BOROUGH_CENTERS) as [Borough, { lat: number; lng: number }][]).sort(
        (a, b) => distanceKm(where.lat, where.lng, a[1].lat, a[1].lng) - distanceKm(where.lat, where.lng, b[1].lat, b[1].lng),
      )[0][0]
    : null;
  const candidates = stores.filter((s) => {
    const d = mi(s);
    if (d !== null) return d <= NEARBY_MI;
    return !borough || s.borough === borough;
  });

  const priceAt = (itemId: string, storeId: string) => pricesFor(itemId).find((p) => p.storeId === storeId)?.price;
  const stopFor = (s: Store, list: Item[]): Stop => {
    const d = mi(s);
    const got = list.flatMap((item) => {
      const p = pricesFor(item.id).find((t) => t.storeId === s.id);
      return p ? [{ item, price: p.price, ...(p.estimated && { estimated: true }) }] : [];
    });
    return {
      store: s,
      items: got,
      subtotal: round(got.reduce((a, x) => a + x.price, 0)),
      miles: d === null ? null : Math.round(d * 10) / 10,
      distance: d === null ? null : miles(d / 0.621371),
      walkMin: d === null ? null : walkMinutes(d / 0.621371),
      fare: d !== null && d > WALKABLE_MI ? round(FARE * 2) : 0,
    };
  };

  // An item nobody reported at a store probably still sells there, at about the city's typical
  // price. Counting it that way keeps "has all 4 reported, 3 miles away" from beating the store
  // next door with 3 of 4.
  const typical = new Map(wanted.map((w) => [w.id, median(pricesFor(w.id).map((p) => p.price))]));
  const travelMin = (st: Stop) => (st.miles === null ? 0 : st.fare ? TRANSIT_MIN : st.walkMin ?? 0);
  const plan = (stops: Stop[]): Plan => {
    const covered = new Set(stops.flatMap((s) => s.items.map((x) => x.item.id)));
    const groceries = round(stops.reduce((a, s) => a + s.subtotal, 0));
    const missing = wanted.filter((w) => !covered.has(w.id));
    const total = round(groceries + stops.reduce((a, s) => a + s.fare, 0));
    const guess = missing.reduce((a, m) => a + (typical.get(m.id) ?? 0), 0);
    // Travel: out to the first store and back; a second stop next door adds little.
    const minutes = travelMin(stops[0]) * 2 + (stops[1] ? Math.min(travelMin(stops[1]), 10) : 0);
    return { stops, groceries, total, missing, score: round(total + guess + minutes * TIME_VALUE) };
  };

  // One store: lowest estimated cost including fare and time, then closest.
  const singles = candidates
    .map((s) => stopFor(s, wanted))
    .filter((st) => st.items.length)
    .map((st) => ({ st, p: plan([st]) }))
    .sort((a, b) => a.p.score - b.p.score || b.st.items.length - a.st.items.length || (a.st.miles ?? 0) - (b.st.miles ?? 0));
  if (!singles.length) return { items: wanted, unknown, best: null, split: null, where };
  const best = singles[0].p;

  // Two stores: each item bought where it's cheaper, only if the stores are close together
  // (or both close to you) and it saves real money after any extra fare.
  let split: ShoppingResult["split"] = null;
  const pool = singles.slice(0, 12).map((x) => x.st);
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const A = pool[i].store;
      const B = pool[j].store;
      const apart = kmToMiles(distanceKm(A.lat, A.lng, B.lat, B.lng));
      const bothNear = (mi(A) ?? Infinity) <= WALKABLE_MI && (mi(B) ?? Infinity) <= WALKABLE_MI;
      if (apart > PAIR_MI && !bothNear) continue;
      const forA: Item[] = [];
      const forB: Item[] = [];
      for (const w of wanted) {
        const pa = priceAt(w.id, A.id);
        const pb = priceAt(w.id, B.id);
        if (pa === undefined && pb === undefined) continue;
        if (pb === undefined || (pa !== undefined && pa <= pb)) forA.push(w);
        else forB.push(w);
      }
      if (!forA.length || !forB.length) continue;
      const a = stopFor(A, forA);
      // The second stop is next door (or you walk to both): only one fare, if any.
      const b = { ...stopFor(B, forB), fare: 0 };
      const p = plan([a, b]);
      // Real money saved on what both plans buy, after fares, and not just a longer walk.
      const saves = round(best.score - p.score);
      const coversMore = p.missing.length < best.missing.length && apart <= PAIR_MI && saves >= 0;
      if ((saves >= MIN_SAVINGS || coversMore) && (!split || p.score < split.score)) split = { ...p, saves };
    }
  }
  return { items: wanted, unknown, best, split, where };
}

// Plain-language summary for the chat and iMessage agent.
export function planForAgent(r: ShoppingResult) {
  const stop = (s: Stop) => ({
    store: s.store.name,
    distance: s.distance ? `${s.distance}${s.fare ? `, subway or bus (${money(s.fare)} round trip)` : `, ${s.walkMin} min walk`}` : undefined,
    items: s.items.map((x) => `${x.item.name} ${money(x.price)}${x.estimated ? " (estimate)" : ""}`),
    subtotal: money(s.subtotal),
  });
  return {
    measured_from: r.where ? (r.where.approximate ? `${r.where.label} (borough only)` : r.where.label ?? "you") : null,
    list: r.items.map((i) => i.name),
    not_tracked_yet: r.unknown,
    best_one_store: r.best && { ...stop(r.best.stops[0]), total_with_fare: money(r.best.total), missing: r.best.missing.map((m) => m.name) },
    worth_two_stops: r.split && { stops: r.split.stops.map(stop), total: money(r.split.total), saves: money(r.split.saves), missing: r.split.missing.map((m) => m.name) },
    note: r.split ? undefined : "Splitting across stores isn't worth it here (not enough savings, or the stores are too far apart).",
  };
}

// Plain text version, for the backup texting rules when Gemini is unavailable.
export function planText(r: ShoppingResult): string {
  if (!r.items.length) return `I don't track ${r.unknown.join(", ") || "those"} yet. Try things like eggs, milk, bread, bananas.`;
  if (!r.best) return "Nobody has reported prices for those near you yet. Be the first: text what you paid!";
  const line = (s: Stop) =>
    `${s.store.name}${s.distance ? ` (${s.distance}${s.fare ? `, ${money(s.fare)} round trip by subway` : `, ${s.walkMin} min walk`})` : ""}: ${s.items.map((x) => `${x.item.name} ${x.estimated ? "about " : ""}${money(x.price)}`).join(", ")}`;
  const out = [`Best single stop: ${line(r.best.stops[0])}. Total ${money(r.best.total)}.`];
  if (r.split) out.push(`Or split it and save ${money(r.split.saves)}: ${r.split.stops.map(line).join(" / ")}.`);
  const missing = (r.split ?? r.best).missing;
  if (missing.length) out.push(`No prices yet nearby for ${missing.map((m) => m.name).join(", ")}.`);
  if (r.unknown.length) out.push(`Not tracked yet: ${r.unknown.join(", ")}.`);
  if (!r.where) out.push("Text me your ZIP and I'll count walking and subway fares.");
  return out.join("\n");
}
