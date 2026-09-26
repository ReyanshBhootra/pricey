import type { Report, TrustedPrice } from "./types";

const FRESH_MS = 30 * 24 * 60 * 60 * 1000;

// Vouching: the price the most people agree on wins.
// 10 people say $10 and 2 say $7 -> $10.
// One person, one vote: only each user's latest report for this item and store counts,
// so nobody can spam a price. Only the last 30 days count, so old prices age out.
// Two-way tie: the more recently reported price wins.
// Three or more tied: the median of the tied prices wins.
export function trustedPrice(reports: Report[]): TrustedPrice | null {
  const latestByUser = new Map<string, Report>();
  for (const r of reports) {
    if (r.type !== "price") continue;
    const prev = latestByUser.get(r.userId);
    if (!prev || r.timestamp > prev.timestamp) latestByUser.set(r.userId, r);
  }
  const votes = [...latestByUser.values()];
  if (votes.length === 0) return null;
  const newest = Math.max(...votes.map((r) => r.timestamp));
  const fresh = votes.filter((r) => r.timestamp >= newest - FRESH_MS);
  const priced = fresh.length ? fresh : votes;

  const buckets = new Map<number, Report[]>();
  for (const r of priced) {
    const cents = Math.round(r.price * 100);
    buckets.set(cents, [...(buckets.get(cents) ?? []), r]);
  }

  const maxVotes = Math.max(...[...buckets.values()].map((b) => b.length));
  const tied = [...buckets.entries()]
    .filter(([, b]) => b.length === maxVotes)
    .sort((a, b) => a[0] - b[0]);

  let [cents, winners] = tied[Math.floor((tied.length - 1) / 2)];
  if (tied.length === 2) {
    // Even tie with two prices: pick the one reported most recently.
    const latest = (b: Report[]) => Math.max(...b.map((r) => r.timestamp));
    [cents, winners] = latest(tied[0][1]) >= latest(tied[1][1]) ? tied[0] : tied[1];
  }

  return {
    itemId: priced[0].itemId,
    storeId: priced[0].storeId,
    price: cents / 100,
    votes: winners.length,
    totalReports: priced.length,
    lastReportedAt: Math.max(...priced.map((r) => r.timestamp)),
  };
}

// Groups reports by store and returns one trusted price per store.
export function trustedPricesByStore(reports: Report[]): TrustedPrice[] {
  const byStore = new Map<string, Report[]>();
  for (const r of reports) {
    byStore.set(r.storeId, [...(byStore.get(r.storeId) ?? []), r]);
  }
  return [...byStore.values()]
    .map(trustedPrice)
    .filter((t): t is TrustedPrice => t !== null);
}

// Groups reports by item and returns one trusted price per item.
export function trustedPricesByItem(reports: Report[]): TrustedPrice[] {
  const byItem = new Map<string, Report[]>();
  for (const r of reports) {
    byItem.set(r.itemId, [...(byItem.get(r.itemId) ?? []), r]);
  }
  return [...byItem.values()]
    .map(trustedPrice)
    .filter((t): t is TrustedPrice => t !== null);
}

export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
