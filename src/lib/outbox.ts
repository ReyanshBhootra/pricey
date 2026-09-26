// Texts Pricey sends first (not replies): bundled deal alerts and tracked price changes.
// The relay asks for these every minute and delivers them; the server decides what and when,
// so nothing is lost if the relay restarts and nobody gets spammed.

import { getActiveEvents, getPriceChanges, getTextableUsers, saveUser } from "./data";
import { money, timeAgo } from "./format";
import { cityIndex } from "./grounding";
import { checkinFor } from "./checkins";
import type { UserProfile } from "./types";
import { distanceKm } from "./vouch";

export interface OutgoingText {
  spaceId: string;
  text: string;
  kind: "alert" | "price_change" | "checkin";
}

const ALERT_GAP = 30 * 60_000; // at most one deal alert per half hour
const MAX_ALERT_KM = 3.2; // about 2 miles from their home

async function dealAlert(u: UserProfile, now: number): Promise<string | null> {
  if (!u.alerts) return null;
  if (u.lastAlertAt && now - u.lastAlertAt < ALERT_GAP) return null;
  const since = Math.max(u.lastAlertAt ?? 0, u.alerts.since);
  const { storeById } = await cityIndex();
  const events = (await getActiveEvents({ hours: 24 })).filter((e) => {
    const s = storeById.get(e.storeId);
    if (!s) return false;
    if (u.alerts!.area !== "all" && s.borough !== u.alerts!.area) return false;
    // With an exact home in their alert borough, keep it to walkable-ish spots.
    if (u.home && !u.home.approximate && u.home.borough === s.borough) return distanceKm(u.home.lat, u.home.lng, s.lat, s.lng) <= MAX_ALERT_KM;
    return true;
  });
  if (!events.some((e) => e.timestamp > since)) return null; // nothing new since last time
  const spots = new Set(events.map((e) => e.storeId)).size;
  const where = u.home && !u.home.approximate ? "near you" : u.alerts.area === "all" ? "in NYC" : `in ${u.alerts.area}`;
  const lines = events.slice(0, 5).map((e) => `- ${storeById.get(e.storeId)?.name}: ${e.note ?? money(e.price)} (${timeAgo(e.timestamp)})`);
  return [`Heads up! ${spots} ${spots === 1 ? "spot" : "spots"} ${where} ${spots === 1 ? "has" : "have"} deals right now:`, ...lines, "Text stop to pause these."].join("\n");
}

async function priceChanges(u: UserProfile): Promise<string | null> {
  if (!u.tracked?.length) return null;
  const since = u.lastChangeSeenAt ?? u.updatedAt ?? Date.now();
  const changes = (await getPriceChanges({ hours: 72, itemIds: u.tracked })).filter((c) => c.timestamp > since);
  if (!changes.length) return null;
  const { itemById, storeById } = await cityIndex();
  const lines = changes.slice(0, 3).map((c) => {
    const dir = c.newPrice < c.oldPrice ? "dropped" : "went up";
    return `- ${itemById.get(c.itemId)?.name} at ${storeById.get(c.storeId)?.name} ${dir}: ${money(c.oldPrice)} to ${money(c.newPrice)}`;
  });
  return [`Price update on what you're tracking:`, ...lines].join("\n");
}

// Everything due right now. Marks it as sent (at most once), so call only from the relay.
export async function collectOutbox(now = Date.now()): Promise<OutgoingText[]> {
  const out: OutgoingText[] = [];
  for (const u of await getTextableUsers()) {
    if (!u.spaceId) continue;
    const patch: Partial<UserProfile> = {};
    const alert = await dealAlert(u, now);
    if (alert) {
      out.push({ spaceId: u.spaceId, text: alert, kind: "alert" });
      patch.lastAlertAt = now;
    }
    const change = await priceChanges(u);
    if (change) out.push({ spaceId: u.spaceId, text: change, kind: "price_change" });
    if (u.tracked?.length) patch.lastChangeSeenAt = now;
    const checkin = await checkinFor(u, now);
    if (checkin) {
      out.push({ spaceId: u.spaceId, text: checkin.text, kind: "checkin" });
      patch.pending = checkin.pending;
      patch.lastCheckinAt = now;
    }
    if (Object.keys(patch).length) await saveUser(u.id, patch);
  }
  return out;
}
