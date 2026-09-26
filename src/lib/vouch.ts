import type { Report, TrustedPrice } from "./types";

const FRESH_MS = 30 * 24 * 60 * 60 * 1000;

// Trust: people whose reports usually match what everyone else sees count a bit more,
// people who are usually off count less. Weight 0.5 to 1.5; everyone starts at 1.
let trust: Map<string, number> = new Map();
export const setTrustWeights = (w: Map<string, number>) => void (trust = w);
export const trustWeight = (userId: string) => trust.get(userId) ?? 1;

// Vouching: the price the most (trusted) people agree on wins.
// 10 people say $10 and 2 say $7 -> $10.
// One person, one vote: only each user's latest report for this item and store counts,
// so nobody can spam a price. Only the last 30 days count, so old prices age out.
// Votes are weighted by trust (above); "votes" in the result still counts people.
// Two-way tie: the more recently reported price wins.
// Three or more tied: the median of the tied prices wins.
export function trustedPrice(reports: Report[], weighted = true): TrustedPrice | null {
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

  const score = (b: Report[]) => b.reduce((sum, r) => sum + (weighted ? trustWeight(r.userId) : 1), 0);
  const best = Math.max(...[...buckets.values()].map(score));
  const tied = [...buckets.entries()]
    .filter(([, b]) => Math.abs(score(b) - best) < 1e-9)
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

export interface TrustStats {
  weight: number;
  checked: number; // reports we could compare against a crowd of 3+ people
  agreed: number;
}

// For each person: how often their latest report at an item and store matched the crowd's
// (unweighted) price, within 3% or 5 cents. Needs 3 comparisons before it moves the weight.
export function computeTrust(reports: Report[]): Map<string, TrustStats> {
  const groups = new Map<string, Report[]>();
  for (const r of reports) {
    if (r.type !== "price") continue;
    const k = `${r.itemId}|${r.storeId}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const stats = new Map<string, TrustStats>();
  for (const group of groups.values()) {
    const latest = new Map<string, Report>();
    for (const r of group) if (!latest.has(r.userId) || r.timestamp > latest.get(r.userId)!.timestamp) latest.set(r.userId, r);
    if (latest.size < 3) continue;
    const crowd = trustedPrice(group, false);
    if (!crowd) continue;
    for (const [user, r] of latest) {
      const s = stats.get(user) ?? { weight: 1, checked: 0, agreed: 0 };
      s.checked++;
      if (Math.abs(r.price - crowd.price) <= Math.max(0.05, crowd.price * 0.03)) s.agreed++;
      stats.set(user, s);
    }
  }
  for (const s of stats.values()) s.weight = s.checked >= 3 ? Math.min(1.5, Math.max(0.5, 0.5 + s.agreed / s.checked)) : 1;
  return stats;
}

export function trustedPricesByStore(reports: Report[]): TrustedPrice[] {
  const byStore = new Map<string, Report[]>();
  for (const r of reports) {
    byStore.set(r.storeId, [...(byStore.get(r.storeId) ?? []), r]);
  }
  return [...byStore.values()]
    .map((r) => trustedPrice(r))
    .filter((t): t is TrustedPrice => t !== null);
}

// Groups reports by item and returns one trusted price per item.
export function trustedPricesByItem(reports: Report[]): TrustedPrice[] {
  const byItem = new Map<string, Report[]>();
  for (const r of reports) {
    byItem.set(r.itemId, [...(byItem.get(r.itemId) ?? []), r]);
  }
  return [...byItem.values()]
    .map((r) => trustedPrice(r))
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
