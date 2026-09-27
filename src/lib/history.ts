// Price history: what an item cost across the city, day by day (median of each store's
// trusted price as of that day). Powers "up 18% this month" and the little trend line.
import { cityIndex } from "./grounding";
import { trustedPricesByStore } from "./vouch";

const DAY = 24 * 60 * 60_000;

export interface PriceHistory {
  points: { at: number; price: number }[];
  changePct: number | null; // first point to last, rounded
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

export async function priceHistory(itemId: string, days = 30, storeId?: string): Promise<PriceHistory> {
  const { reports } = await cityIndex();
  const mine = reports.filter((r) => r.type === "price" && r.itemId === itemId && (!storeId || r.storeId === storeId));
  const now = Date.now();
  const points: PriceHistory["points"] = [];
  for (let d = days; d >= 0; d--) {
    const asOf = now - d * DAY;
    const trusted = trustedPricesByStore(mine.filter((r) => r.timestamp <= asOf));
    if (trusted.length) points.push({ at: asOf, price: Math.round(median(trusted.map((t) => t.price)) * 100) / 100 });
  }
  const first = points[0]?.price;
  const last = points.at(-1)?.price;
  const changePct = points.length >= 2 && first ? Math.round(((last! - first) / first) * 100) : null;
  return { points, changePct };
}

export function describeChange(pct: number | null, days = 30): string | null {
  if (pct === null) return null;
  const span = days >= 28 ? "this month" : `in ${days} days`;
  if (Math.abs(pct) < 2) return `Steady ${span}`;
  return `${pct > 0 ? "Up" : "Down"} ${Math.abs(pct)}% ${span}`;
}
