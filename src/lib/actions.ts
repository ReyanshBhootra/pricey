"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { addItem, addStore, createForumPost, submitReport } from "./data";
import { BOROUGH_CENTERS, inNyc } from "./format";
import { dealsDigest, handleText, postDeal } from "./texting";
import { BOROUGHS, CATEGORIES, type Borough, type Category, type SubmitResult } from "./types";

// Anonymous per-browser id so reports and posts have a userId without login.
async function userId() {
  const jar = await cookies();
  let id = jar.get("pricey_uid")?.value;
  if (!id) {
    id = `web-${crypto.randomUUID()}`;
    jar.set("pricey_uid", id, { maxAge: 60 * 60 * 24 * 365, httpOnly: true, sameSite: "lax" });
  }
  return id;
}

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

// The /text simulator: same handler as the real iMessage line.
export async function simulateTextAction(text: string): Promise<{ reply: string; alert: string | null }> {
  const clean = String(text ?? "").slice(0, 500);
  if (!clean.trim()) return { reply: "Say something! Text help to see what I can do.", alert: null };
  const { reply, action } = await handleText(`sim-${await userId()}`, clean);
  revalidatePath("/", "layout");
  // On the real line, alerts arrive later as one bundled text. Here we show one right away.
  const alert = action && "subscribe" in action ? await dealsDigest(action.subscribe === "all" ? null : action.subscribe) : null;
  return { reply, alert };
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
