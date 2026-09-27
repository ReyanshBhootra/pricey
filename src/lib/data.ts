// The one data API everyone calls: the app (B), the chatbot (C), and Photon (D).
// With Firebase env vars set it talks to Firestore. Without them it runs on an
// in-memory copy of the seed data, so nobody is blocked waiting on setup.

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
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
  PriceChange,
  UserProfile,
  Report,
  Store,
  SubmitResult,
  TrustedPrice,
} from "./types";
import { mergeReports, mergeStore, mergeStores } from "./real-prices";
import { computeTrust, distanceKm, setTrustWeights, trustedPrice, trustedPricesByItem, trustedPricesByStore, type TrustStats } from "./vouch";

// ---------- in-memory fallback ----------

// Kept on globalThis so writes survive dev hot reloads.
const g = globalThis as unknown as { __priceyMem?: typeof seedMem };
const seedMem = {
  stores: [...SEED_STORES],
  items: [...SEED_ITEMS],
  reports: [...SEED_REPORTS],
  forumPosts: [...SEED_FORUM_POSTS],
  priceChanges: [] as PriceChange[],
  users: {} as Record<string, UserProfile>,
  aliases: {} as Record<string, string>,
};
const mem = (g.__priceyMem ??= seedMem);

async function all<T>(db: Firestore | null, name: keyof typeof mem): Promise<T[]> {
  const rows = db ? (await getDocs(collection(db, COLLECTIONS[name]))).docs.map((d) => ({ ...d.data(), id: d.id }) as T) : (mem[name] as T[]);
  // Scraped real prices ship with the app and are layered in here (see real-prices.ts).
  if (name === "stores") return mergeStores(rows as Store[]) as T[];
  if (name === "reports") return mergeReports(rows as Report[]) as T[];
  return rows;
}

async function reportsWhere(field: "itemId" | "storeId", value: string): Promise<Report[]> {
  const db = getDb();
  let rows: Report[];
  if (!db) rows = mem.reports.filter((r) => r[field] === value);
  else {
    const snap = await getDocs(query(collection(db, COLLECTIONS.reports), where(field, "==", value)));
    rows = snap.docs.map((d) => ({ ...d.data(), id: d.id }) as Report);
  }
  return withPeople(mergeReports(rows, (r) => r[field] === value));
}

// ---------- people behind reports: account aliases and trust ----------

// Anonymous browser ids that belong to an account ("web-123" -> "text-abc"), cached 30s.
let aliasCache: { at: number; map: Promise<Map<string, string>> } | null = null;
export function getAliases(): Promise<Map<string, string>> {
  if (!aliasCache || Date.now() - aliasCache.at > 30_000) {
    const db = getDb();
    const map = db
      ? getDocs(collection(db, COLLECTIONS.aliases)).then((snap) => new Map(snap.docs.map((d) => [d.id, String(d.data().userId)])))
      : Promise.resolve(new Map(Object.entries(mem.aliases)));
    aliasCache = { at: Date.now(), map };
    map.catch(() => (aliasCache = null));
  }
  return aliasCache.map;
}

// Everything this browser did before logging in now belongs to the account.
export async function addAlias(fromId: string, toId: string) {
  if (!fromId || fromId === toId) return;
  const db = getDb();
  if (!db) mem.aliases[fromId] = toId;
  else await setDoc(doc(db, COLLECTIONS.aliases, fromId), { userId: toId, at: Date.now() });
  aliasCache = null;
  trustAt = 0;
}

let trustAt = 0;
let trustStats = new Map<string, TrustStats>();
async function refreshTrust(aliases: Map<string, string>) {
  if (Date.now() - trustAt < 60_000) return;
  trustAt = Date.now();
  const db = getDb();
  const raw = mergeReports(db ? (await getDocs(collection(db, COLLECTIONS.reports))).docs.map((d) => d.data() as Report) : mem.reports);
  trustStats = computeTrust(raw.map((r) => (aliases.has(r.userId) ? { ...r, userId: aliases.get(r.userId)! } : r)));
  setTrustWeights(new Map([...trustStats].map(([u, s]) => [u, s.weight])));
}

// Reports with anonymous ids mapped to their account, and trust weights up to date.
async function withPeople(rows: Report[]): Promise<Report[]> {
  const aliases = await getAliases();
  await refreshTrust(aliases);
  return aliases.size ? rows.map((r) => (aliases.has(r.userId) ? { ...r, userId: aliases.get(r.userId)! } : r)) : rows;
}

export async function getTrustStats(userId: string): Promise<TrustStats | null> {
  await refreshTrust(await getAliases());
  return trustStats.get(userId) ?? null;
}

// ---------- reads ----------

export function getStores(): Promise<Store[]> {
  return all<Store>(getDb(), "stores");
}

export function getItems(): Promise<Item[]> {
  return all<Item>(getDb(), "items");
}

export async function getStore(id: string): Promise<Store | null> {
  const db = getDb();
  if (!db) return mergeStore(mem.stores.find((s) => s.id === id) ?? null, id);
  const snap = await getDoc(doc(db, COLLECTIONS.stores, id));
  return mergeStore(snap.exists() ? ({ ...snap.data(), id: snap.id } as Store) : null, id);
}

export async function getItem(id: string): Promise<Item | null> {
  const db = getDb();
  if (!db) return mem.items.find((i) => i.id === id) ?? null;
  const snap = await getDoc(doc(db, COLLECTIONS.items, id));
  return snap.exists() ? ({ ...snap.data(), id: snap.id } as Item) : null;
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

// Every report (for grounding the chatbot on the whole city in one read).
export async function getAllReports(): Promise<Report[]> {
  return withPeople(await all<Report>(getDb(), "reports"));
}

// Trusted price of one item at every store that has reports, cheapest first.
export async function getPricesForItem(itemId: string): Promise<TrustedPrice[]> {
  const reports = await reportsWhere("itemId", itemId);
  return trustedPricesByStore(reports).sort((a, b) => a.price - b.price);
}

// Trusted prices for many stores in one go (for the nearby list).
// Returns storeId -> trusted prices, optionally filtered by category.
export async function getPricesForStores(storeIds: string[], category?: Category): Promise<Map<string, TrustedPrice[]>> {
  const db = getDb();
  let reports: Report[] = [];
  if (!db) {
    const ids = new Set(storeIds);
    reports = mem.reports.filter((r) => ids.has(r.storeId));
  } else {
    // Firestore "in" takes up to 30 values.
    for (let i = 0; i < storeIds.length; i += 30) {
      const snap = await getDocs(query(collection(db, COLLECTIONS.reports), where("storeId", "in", storeIds.slice(i, i + 30))));
      reports.push(...snap.docs.map((d) => ({ ...d.data(), id: d.id }) as Report));
    }
  }
  const wanted = new Set(storeIds);
  reports = await withPeople(mergeReports(reports, (r) => wanted.has(r.storeId)));
  const items = category ? await getItems() : [];
  const allowed = category ? new Set(items.filter((i) => i.category === category).map((i) => i.id)) : null;

  const byStore = new Map<string, Report[]>();
  for (const r of reports) {
    if (allowed && !allowed.has(r.itemId)) continue;
    byStore.set(r.storeId, [...(byStore.get(r.storeId) ?? []), r]);
  }
  return new Map(storeIds.map((id) => [id, trustedPricesByItem(byStore.get(id) ?? [])]));
}

// Recent trusted price moves, newest first. Pass itemIds to only get tracked items.
export async function getPriceChanges(opts: { hours?: number; itemIds?: string[] } = {}): Promise<PriceChange[]> {
  const { hours = 48, itemIds } = opts;
  const since = Date.now() - hours * 60 * 60 * 1000;
  const db = getDb();
  let changes: PriceChange[];
  if (!db) {
    changes = mem.priceChanges;
  } else {
    const snap = await getDocs(query(collection(db, COLLECTIONS.priceChanges), where("timestamp", ">=", since)));
    changes = snap.docs.map((d) => ({ ...d.data(), id: d.id }) as PriceChange);
  }
  const wanted = itemIds ? new Set(itemIds) : null;
  return changes
    .filter((c) => c.timestamp >= since && (!wanted || wanted.has(c.itemId)))
    .sort((a, b) => b.timestamp - a.timestamp);
}

// Everything one person reported (for stale-price check-ins).
// This person's own ids, read fresh (not from the 30 second cache) so a report made right
// before logging in shows up right after.
async function idsOf(userId: string): Promise<string[]> {
  const db = getDb();
  if (!db) return [userId, ...Object.entries(mem.aliases).filter(([, to]) => to === userId).map(([from]) => from)];
  const snap = await getDocs(query(collection(db, COLLECTIONS.aliases), where("userId", "==", userId)));
  return [userId, ...snap.docs.map((d) => d.id)];
}

export async function getReportsForUser(userId: string): Promise<Report[]> {
  const ids = await idsOf(userId);
  const db = getDb();
  let rows: Report[] = [];
  if (!db) rows = mem.reports.filter((r) => ids.includes(r.userId));
  else {
    for (let i = 0; i < ids.length; i += 30) {
      const snap = await getDocs(query(collection(db, COLLECTIONS.reports), where("userId", "in", ids.slice(i, i + 30))));
      rows.push(...snap.docs.map((d) => ({ ...d.data(), id: d.id }) as Report));
    }
  }
  return rows.map((r) => ({ ...r, userId }));
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
  events = mergeReports(events, () => false).filter((e) => e.timestamp >= since);
  if (lat !== undefined && lng !== undefined) {
    const nearby = new Set((await getNearbyStores(lat, lng, radiusKm)).map((s) => s.id));
    events = events.filter((e) => nearby.has(e.storeId));
  }
  // The same deal posted twice (or by two people) shows once, newest first.
  const seen = new Set<string>();
  return events
    .sort((a, b) => b.timestamp - a.timestamp)
    .filter((e) => {
      const key = `${e.storeId}|${(e.note ?? e.itemId).toLowerCase().replace(/\W+/g, " ").trim()}`;
      return !seen.has(key) && seen.add(key);
    });
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
  const priceChanged = oldPrice !== null && newPrice !== null && oldPrice !== newPrice;

  if (priceChanged) {
    const change = { itemId: report.itemId, storeId: report.storeId, oldPrice, newPrice, timestamp: report.timestamp };
    if (!db) mem.priceChanges.push({ ...change, id: `mem-change-${mem.priceChanges.length + 1}` });
    else await addDoc(collection(db, COLLECTIONS.priceChanges), change);
  }

  return { report, priceChanged, oldPrice, newPrice };
}

const slug = (s: string) =>
  s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

// Adds an item, or returns the existing one with the same name.
export async function addItem(input: Omit<Item, "id">): Promise<Item> {
  const name = input.name.trim();
  const id = slug(name);
  if (!id) throw new Error("Item name is empty");
  const existing = await getItem(id);
  if (existing) return existing;
  const item: Item = { id, name, category: input.category };
  const db = getDb();
  if (!db) mem.items.push(item);
  else await setDoc(doc(db, COLLECTIONS.items, id), { name, category: input.category });
  return item;
}

// Adds a store, or returns the existing one with the same name in the same borough.
export async function addStore(input: Omit<Store, "id">): Promise<Store> {
  const name = input.name.trim();
  const id = slug(`${name} ${input.borough}`);
  if (!slug(name)) throw new Error("Store name is empty");
  const existing = await getStore(id);
  if (existing) return existing;
  const store: Store = { ...input, id, name };
  const db = getDb();
  if (!db) mem.stores.push(store);
  else await setDoc(doc(db, COLLECTIONS.stores, id), { name, borough: input.borough, lat: input.lat, lng: input.lng });
  return store;
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

// ---------- people ----------

export async function getUser(id: string): Promise<UserProfile | null> {
  const db = getDb();
  if (!db) return mem.users[id] ? structuredClone(mem.users[id]) : null;
  const snap = await getDoc(doc(db, COLLECTIONS.users, id));
  return snap.exists() ? ({ ...snap.data(), id: snap.id } as UserProfile) : null;
}

// Merges the given fields into the profile (creating it if needed). Undefined fields are skipped.
export async function saveUser(id: string, patch: Partial<UserProfile>): Promise<UserProfile> {
  const clean = Object.fromEntries(Object.entries(patch).filter(([k, v]) => v !== undefined && k !== "id"));
  const now = Date.now();
  const existing = await getUser(id);
  const next = { ...(existing ?? { createdAt: now }), ...clean, id, updatedAt: now } as UserProfile;
  const db = getDb();
  if (!db) mem.users[id] = structuredClone(next);
  else {
    const { id: _id, ...data } = next;
    void _id;
    await setDoc(doc(db, COLLECTIONS.users, id), JSON.parse(JSON.stringify(data)));
  }
  return next;
}

// Everyone who can be texted first (has an iMessage conversation on file).
export async function getTextableUsers(): Promise<UserProfile[]> {
  const db = getDb();
  if (!db) return Object.values(mem.users).filter((u) => u.spaceId).map((u) => structuredClone(u));
  const snap = await getDocs(query(collection(db, COLLECTIONS.users), where("spaceId", "!=", null)));
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }) as UserProfile);
}
