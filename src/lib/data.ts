// The one data API everyone calls: the app (B), the chatbot (C), and Photon (D).
// With Firebase env vars set it talks to Firestore. Without them it runs on an
// in-memory copy of the seed data, so nobody is blocked waiting on setup.

import {
  addDoc,
  collection,
  getDocs,
  query,
  where,
  type Firestore,
} from "firebase/firestore";
import { COLLECTIONS, getDb } from "./firebase";
import { SEED_FORUM_POSTS, SEED_ITEMS, SEED_REPORTS, SEED_STORES } from "./seed";
import type {
  Borough,
  Category,
  ForumPost,
  Item,
  NewForumPost,
  NewReport,
  Report,
  Store,
  SubmitResult,
  TrustedPrice,
} from "./types";
import { distanceKm, trustedPrice, trustedPricesByItem, trustedPricesByStore } from "./vouch";

// ---------- in-memory fallback ----------

const mem = {
  stores: [...SEED_STORES],
  items: [...SEED_ITEMS],
  reports: [...SEED_REPORTS],
  forumPosts: [...SEED_FORUM_POSTS],
};

async function all<T>(db: Firestore | null, name: keyof typeof mem): Promise<T[]> {
  if (!db) return mem[name] as T[];
  const snap = await getDocs(collection(db, COLLECTIONS[name]));
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }) as T);
}

async function reportsWhere(field: "itemId" | "storeId", value: string): Promise<Report[]> {
  const db = getDb();
  if (!db) return mem.reports.filter((r) => r[field] === value);
  const snap = await getDocs(query(collection(db, COLLECTIONS.reports), where(field, "==", value)));
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }) as Report);
}

// ---------- reads ----------

export function getStores(): Promise<Store[]> {
  return all<Store>(getDb(), "stores");
}

export function getItems(): Promise<Item[]> {
  return all<Item>(getDb(), "items");
}

export interface NearbyStore extends Store {
  distanceKm: number;
}

// Stores within radiusKm of the user, closest first.
export async function getNearbyStores(lat: number, lng: number, radiusKm = 3): Promise<NearbyStore[]> {
  const stores = await getStores();
  return stores
    .map((s) => ({ ...s, distanceKm: distanceKm(lat, lng, s.lat, s.lng) }))
    .filter((s) => s.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

// Trusted price of one item at every store that has reports, cheapest first.
export async function getPricesForItem(itemId: string): Promise<TrustedPrice[]> {
  const reports = await reportsWhere("itemId", itemId);
  return trustedPricesByStore(reports).sort((a, b) => a.price - b.price);
}

// Raw reports for a store (price and event), newest first.
export async function getReportsForStore(storeId: string): Promise<Report[]> {
  const reports = await reportsWhere("storeId", storeId);
  return reports.sort((a, b) => b.timestamp - a.timestamp);
}

// Trusted price of every item at one store, optionally filtered by category.
export async function getStorePrices(storeId: string, category?: Category): Promise<TrustedPrice[]> {
  const [reports, items] = await Promise.all([reportsWhere("storeId", storeId), getItems()]);
  const allowed = category ? new Set(items.filter((i) => i.category === category).map((i) => i.id)) : null;
  return trustedPricesByItem(reports).filter((t) => !allowed || allowed.has(t.itemId));
}

// Free food and pop-up reports from the last `hours`, newest first.
// Pass lat/lng to limit to stores within radiusKm.
export async function getActiveEvents(opts: { hours?: number; lat?: number; lng?: number; radiusKm?: number } = {}): Promise<Report[]> {
  const { hours = 24, lat, lng, radiusKm = 3 } = opts;
  const since = Date.now() - hours * 60 * 60 * 1000;
  const db = getDb();
  let events: Report[];
  if (!db) {
    events = mem.reports.filter((r) => r.type === "event");
  } else {
    const snap = await getDocs(query(collection(db, COLLECTIONS.reports), where("type", "==", "event")));
    events = snap.docs.map((d) => ({ ...d.data(), id: d.id }) as Report);
  }
  events = events.filter((e) => e.timestamp >= since);
  if (lat !== undefined && lng !== undefined) {
    const nearby = new Set((await getNearbyStores(lat, lng, radiusKm)).map((s) => s.id));
    events = events.filter((e) => nearby.has(e.storeId));
  }
  return events.sort((a, b) => b.timestamp - a.timestamp);
}

export async function getForumPosts(borough: Borough): Promise<ForumPost[]> {
  const db = getDb();
  let posts: ForumPost[];
  if (!db) {
    posts = mem.forumPosts.filter((p) => p.borough === borough);
  } else {
    const snap = await getDocs(query(collection(db, COLLECTIONS.forumPosts), where("borough", "==", borough)));
    posts = snap.docs.map((d) => ({ ...d.data(), id: d.id }) as ForumPost);
  }
  return posts.sort((a, b) => b.timestamp - a.timestamp);
}

// ---------- writes ----------

// Saves a report and tells you whether it moved the trusted price
// for that item at that store (use this for price change alerts).
export async function submitReport(input: NewReport): Promise<SubmitResult> {
  if (!(input.price >= 0) || !input.itemId || !input.storeId) {
    throw new Error("Report needs itemId, storeId, and a price of 0 or more");
  }
  const existing = (await reportsWhere("itemId", input.itemId)).filter((r) => r.storeId === input.storeId);
  const before = trustedPrice(existing);

  const data: Omit<Report, "id"> = { ...input, price: Math.round(input.price * 100) / 100, timestamp: Date.now() };
  if (data.note === undefined) delete data.note; // Firestore rejects undefined fields
  const db = getDb();
  let report: Report;
  if (!db) {
    report = { ...data, id: `mem-${mem.reports.length + 1}-${data.timestamp}` };
    mem.reports.push(report);
  } else {
    const ref = await addDoc(collection(db, COLLECTIONS.reports), data);
    report = { ...data, id: ref.id };
  }

  const after = trustedPrice([...existing, report]);
  const oldPrice = before?.price ?? null;
  const newPrice = after?.price ?? null;
  return { report, priceChanged: oldPrice !== null && oldPrice !== newPrice, oldPrice, newPrice };
}

export async function createForumPost(input: NewForumPost): Promise<ForumPost> {
  const text = input.text.trim();
  if (!text) throw new Error("Post text is empty");
  const data = { ...input, text, timestamp: Date.now() };
  const db = getDb();
  if (!db) {
    const post = { ...data, id: `mem-post-${mem.forumPosts.length + 1}-${data.timestamp}` };
    mem.forumPosts.push(post);
    return post;
  }
  const ref = await addDoc(collection(db, COLLECTIONS.forumPosts), data);
  return { ...data, id: ref.id };
}
