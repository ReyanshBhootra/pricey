"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createForumPost, submitReport } from "./data";
import { BOROUGHS, type Borough, type SubmitResult } from "./types";

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

export async function submitReportAction(_prev: ReportState, form: FormData): Promise<ReportState> {
  const itemId = String(form.get("itemId") ?? "");
  const storeId = String(form.get("storeId") ?? "");
  const price = Number(form.get("price"));
  if (!itemId || !storeId) return { ok: false, error: "Pick an item and a store." };
  if (!Number.isFinite(price) || price < 0 || price > 1000) return { ok: false, error: "Enter a price like 3.49." };

  try {
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
