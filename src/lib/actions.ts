"use server";

import { actingUserId, sessionUserId } from "./session";
import { findPlace, placeFromZip } from "./places";
import { revalidatePath } from "next/cache";
import { addItem, addStore, createForumPost, saveUser, submitReport } from "./data";
import { BOROUGH_CENTERS, inNyc } from "./format";
import { dealsDigest, handleText, postDeal } from "./texting";
import { BOROUGHS, CATEGORIES, type Borough, type Category, type SubmitResult, type UserProfile } from "./types";

// Reports and posts belong to the logged-in account, or to this browser until they log in.
const userId = actingUserId;

export type ReportState = { ok: true; result: SubmitResult } | { ok: false; error: string } | null;

const NEW = "__new";

export async function submitReportAction(_prev: ReportState, form: FormData): Promise<ReportState> {
  const get = (k: string) => String(form.get(k) ?? "").trim();
  let itemId = get("itemId");
  let storeId = get("storeId");
  const price = Number(get("price"));
  if (!itemId || !storeId) return { ok: false, error: "Pick an item and a store." };
  if (!Number.isFinite(price) || price < 0 || price > 1000) return { ok: false, error: "Enter a price like 3.49." };

  try {
    if (itemId === NEW) {
      const name = get("newItemName").slice(0, 80);
      const category = get("newItemCategory") as Category;
      if (!name) return { ok: false, error: "Type the new item's name." };
      if (!CATEGORIES.includes(category)) return { ok: false, error: "Pick a category for the new item." };
      itemId = (await addItem({ name, category })).id;
    }
    if (storeId === NEW) {
      const name = get("newStoreName").slice(0, 100);
      const borough = get("newStoreBorough") as Borough;
      if (!name) return { ok: false, error: "Type the new store's name." };
      if (!BOROUGHS.includes(borough)) return { ok: false, error: "Pick the new store's borough." };
      const lat = Number(get("newStoreLat"));
      const lng = Number(get("newStoreLng"));
      const here = inNyc(lat, lng) ? { lat, lng } : BOROUGH_CENTERS[borough];
      storeId = (await addStore({ name, borough, ...here })).id;
    }

    const result = await submitReport({ itemId, storeId, price, userId: await userId(), type: "price" });
    revalidatePath("/", "layout");
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the report." };
  }
}

export type ReceiptLineInput = { itemId: string | null; name: string; category: Category; price: number };
export type ReceiptSubmitState = { ok: true; saved: number; changed: number } | { ok: false; error: string };

// Saves the lines a person confirmed after scanning a receipt, one report per line.
export async function submitReceiptAction(store: { storeId: string | null; newStoreName?: string; newStoreBorough?: string }, lines: ReceiptLineInput[]): Promise<ReceiptSubmitState> {
  const good = lines.filter((l) => Number.isFinite(l.price) && l.price >= 0 && l.price <= 1000 && (l.itemId || l.name?.trim())).slice(0, 60);
  if (!good.length) return { ok: false, error: "Pick at least one line to save." };

  try {
    let storeId = store.storeId;
    if (!storeId) {
      const borough = store.newStoreBorough as Borough;
      if (!store.newStoreName?.trim() || !BOROUGHS.includes(borough)) return { ok: false, error: "Pick the store, or name it and pick its borough." };
      storeId = (await addStore({ name: store.newStoreName.slice(0, 100), borough, ...BOROUGH_CENTERS[borough] })).id;
    }

    const uid = await userId();
    let changed = 0;
    for (const l of good) {
      const itemId = l.itemId ?? (await addItem({ name: l.name.slice(0, 80), category: CATEGORIES.includes(l.category) ? l.category : "pantry" })).id;
      const r = await submitReport({ itemId, storeId, price: l.price, userId: uid, type: "price" });
      if (r.priceChanged) changed++;
    }
    revalidatePath("/", "layout");
    return { ok: true, saved: good.length, changed };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the receipt." };
  }
}

export type ProfileState = { ok: true } | { ok: false; error: string } | null;

// Name, email, and home for the logged-in account.
export async function saveProfileAction(_prev: ProfileState, form: FormData): Promise<ProfileState> {
  const id = await sessionUserId();
  if (!id) return { ok: false, error: "Please log in again." };
  const get = (k: string) => String(form.get(k) ?? "").trim();
  const firstName = get("firstName").slice(0, 40);
  const lastName = get("lastName").slice(0, 40);
  const email = get("email").slice(0, 120);
  const zip = get("zip");
  if (!firstName) return { ok: false, error: "What should Pricey call you?" };
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "That email doesn't look right (it's optional, you can leave it empty)." };
  let home: UserProfile["home"] | undefined;
  if (zip) {
    const p = placeFromZip(zip) ?? findPlace(zip);
    if (!p) return { ok: false, error: "Use a 5-digit NYC ZIP code, like 11215." };
    home = { label: p.label, lat: p.lat, lng: p.lng, borough: p.borough };
  }
  await saveUser(id, { firstName, lastName: lastName || undefined, email: email || undefined, home });
  revalidatePath("/", "layout");
  return { ok: true };
}

// Keeps tracked items and starred stores in the account, so they follow you across devices.
export async function syncListsAction(lists: { tracked?: string[]; favorites?: string[] }) {
  const id = await sessionUserId();
  if (!id) return;
  const clean = (v?: string[]) => (Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === "string"))].slice(0, 100) : undefined);
  await saveUser(id, { tracked: clean(lists.tracked), favorites: clean(lists.favorites) });
}

// The /text simulator: same handler and brain as the real iMessage line.
export async function simulateTextAction(text: string): Promise<{ reply: string; react: string | null; contactCard: boolean; alert: string | null }> {
  const clean = String(text ?? "").slice(0, 500);
  if (!clean.trim()) return { reply: "Say something! Ask me what anything costs.", react: null, contactCard: false, alert: null };
  // Logged in: the simulator is your real account (same profile as your iMessage).
  const account = await sessionUserId();
  const r = await handleText(account ?? `sim-${await userId()}`, clean, { channel: "web", userId: account ?? undefined });
  revalidatePath("/", "layout");
  // On the real line, alerts arrive later as one bundled text. Here we show one right away.
  const alert = r.action && "subscribe" in r.action ? await dealsDigest(r.action.subscribe === "all" ? null : r.action.subscribe) : null;
  return { reply: r.reply, react: r.react ?? null, contactCard: Boolean(r.contactCard), alert };
}

export type DealState = { ok: true; note: string } | { ok: false; error: string } | null;

export async function submitDealAction(_prev: DealState, form: FormData): Promise<DealState> {
  const storeId = String(form.get("storeId") ?? "");
  const what = String(form.get("what") ?? "").trim();
  const priceText = String(form.get("price") ?? "").trim();
  const price = priceText ? Number(priceText) : 0;
  if (!storeId) return { ok: false, error: "Pick where it is." };
  if (!what) return { ok: false, error: "Say what it is, like: free bagels until 5pm." };
  if (!Number.isFinite(price) || price < 0 || price > 1000) return { ok: false, error: "Leave price empty for free, or enter a price like 1.00." };
  try {
    const note = await postDeal({ userId: await userId(), storeId, what, price });
    revalidatePath("/", "layout");
    return { ok: true, note };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not post that." };
  }
}

export async function createPostAction(form: FormData) {
  const borough = String(form.get("borough")) as Borough;
  const text = String(form.get("text") ?? "").trim().slice(0, 500);
  if (!BOROUGHS.includes(borough) || !text) return;
  await createForumPost({ borough, text, userId: await userId() });
  revalidatePath("/forum");
}
