// Everything the map needs about each store, computed on the server from one read.
import { getActiveEvents } from "./data";
import { money } from "./format";
import { cityIndex } from "./grounding";
import { CATEGORIES, type Category } from "./types";
import { distanceKm } from "./vouch";

export interface MapStore {
  id: string;
  name: string;
  borough: string;
  lat: number;
  lng: number;
  distanceKm: number | null;
  prices: { item: string; price: string }[]; // a few, for the card
  deals: string[]; // live free food / discounts
  reportsToday: number; // "Trending"
  reporters: number; // "Popular": different people who report here
  valueVsCity: number | null; // % vs the city median for the same items; -12 means 12% cheaper
  byCategory: Partial<Record<Category, string>>; // "Coffee from $2.28"
}

const DAY = 24 * 60 * 60_000;

export async function getMapStores(where: { lat: number; lng: number } | null): Promise<MapStore[]> {
  const [{ stores, items, pricesFor, reports }, events] = await Promise.all([cityIndex(), getActiveEvents({ hours: 24 })]);
  const now = Date.now();

  // City median trusted price per item, to say how cheap each store is overall.
  const median = new Map<string, number>();
  for (const item of items) {
    const ps = pricesFor(item.id).map((p) => p.price).sort((a, b) => a - b);
    if (ps.length) median.set(item.id, ps[Math.floor(ps.length / 2)]);
  }

  return stores.map((s) => {
    const here = items
      .map((item) => ({ item, p: pricesFor(item.id).find((p) => p.storeId === s.id) }))
      .filter((x): x is { item: (typeof items)[number]; p: NonNullable<typeof x.p> } => Boolean(x.p));
    const ratios = here.filter((x) => median.get(x.item.id)).map((x) => x.p.price / median.get(x.item.id)!);
    const value = ratios.length >= 3 ? Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length - 1) * 100) : null;
    const byCategory: Partial<Record<Category, string>> = {};
    for (const c of CATEGORIES) {
      const inCat = here.filter((x) => x.item.category === c).sort((a, b) => a.p.price - b.p.price);
      if (inCat.length) byCategory[c] = `${inCat[0].item.name.split(" (")[0]} ${money(inCat[0].p.price)}`;
    }
    const mine = reports.filter((r) => r.storeId === s.id);
    return {
      id: s.id,
      name: s.name,
      borough: s.borough,
      lat: s.lat,
      lng: s.lng,
      distanceKm: where ? distanceKm(where.lat, where.lng, s.lat, s.lng) : null,
      prices: here.sort((a, b) => a.item.name.localeCompare(b.item.name)).slice(0, 6).map((x) => ({ item: x.item.name, price: money(x.p.price) })),
      deals: events.filter((e) => e.storeId === s.id).map((e) => e.note ?? "Deal"),
      reportsToday: mine.filter((r) => now - r.timestamp < DAY).length,
      reporters: new Set(mine.map((r) => r.userId)).size,
      valueVsCity: value,
      byCategory,
    };
  });
}
