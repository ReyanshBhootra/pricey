"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { addItem, addStore, createForumPost, submitReport } from "./data";
import { BOROUGH_CENTERS, inNyc } from "./format";
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

export async function createPostAction(form: FormData) {
  const borough = String(form.get("borough")) as Borough;
  const text = String(form.get("text") ?? "").trim().slice(0, 500);
  if (!BOROUGHS.includes(borough) || !text) return;
  await createForumPost({ borough, text, userId: await userId() });
  revalidatePath("/forum");
}
