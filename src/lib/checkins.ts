// Stale price check-ins: when a trusted price hasn't been confirmed in a week, ask someone who
// shops at that store "Still $3.99?". Their answer (via the agent's checkin_reply tool) is a
// normal report, so vouching keeps prices fresh without anyone filling out a form.

import { getReportsForUser } from "./data";
import { money } from "./format";
import { cityIndex } from "./grounding";
import type { PendingAction, UserProfile } from "./types";

export const STALE_MS = 7 * 24 * 60 * 60_000;
const CHECKIN_GAP = 24 * 60 * 60_000; // at most one check-in a day per person
const RECENT_VISIT = 30 * 24 * 60 * 60_000;

export async function checkinFor(u: UserProfile, now = Date.now()): Promise<{ text: string; pending: PendingAction } | null> {
  if (u.pending) return null; // don't stack questions
  if (u.lastCheckinAt && now - u.lastCheckinAt < CHECKIN_GAP) return null;
  const mine = (await getReportsForUser(u.id)).filter((r) => r.type === "price" && now - r.timestamp < RECENT_VISIT);
  if (!mine.length) return null;
  const { pricesFor, itemById, storeById } = await cityIndex();
  const stores = [...new Set(mine.map((r) => r.storeId))];
  for (const storeId of stores) {
    for (const [itemId] of itemById) {
      const p = pricesFor(itemId).find((x) => x.storeId === storeId);
      if (!p || now - p.lastReportedAt < STALE_MS) continue;
      const item = itemById.get(itemId)!.name;
      const store = storeById.get(storeId)?.name ?? "that store";
      return {
        text: `Quick one since you shop at ${store}: is ${item} still ${money(p.price)} there? Reply yes, or the new price.`,
        pending: { kind: "checkin", itemId, storeId, price: p.price, at: now },
      };
    }
  }
  return null;
}
