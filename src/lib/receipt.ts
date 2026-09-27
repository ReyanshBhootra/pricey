// Server only. Receipt photo -> store + item lines, matched to our catalog.
import { getItems, getStores } from "./data";
import { generate } from "./gemini";
import { CATEGORIES, type Category } from "./types";

export interface ReceiptLine {
  raw: string; // what the receipt says, e.g. "LG EGGS DZ"
  name: string; // readable name
  price: number; // unit price actually paid
  itemId: string | null; // matched catalog item, or null for a new item
  category: Category;
}

export interface ParsedReceipt {
  storeId: string | null;
  storeName: string;
  storeAddress: string; // as printed, for adding a store Pricey doesn't know yet
  subtotal: number | null; // as printed; we never add the lines up with the model
  total: number | null;
  lines: ReceiptLine[];
}

const SCHEMA = {
  type: "object",
  properties: {
    storeName: { type: "string", description: "Store name as printed, or empty if not visible" },
    storeId: { type: ["string", "null"], description: "id from KNOWN STORES if it is clearly the same store, else null" },
    storeAddress: { type: "string", description: "Store street address, city, and ZIP as printed, or empty" },
    subtotal: { type: ["number", "null"], description: "Subtotal as printed, or null" },
    total: { type: ["number", "null"], description: "Total as printed (after tax), or null" },
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          raw: { type: "string" },
          name: { type: "string", description: "Short readable product name with size, e.g. 'Eggs (dozen)'" },
          price: { type: "number", description: "Price for ONE unit in USD, after per-item discounts, before tax" },
          itemId: { type: ["string", "null"], description: "id from KNOWN ITEMS if it is the same product, else null" },
          category: { type: "string", enum: [...CATEGORIES] },
        },
        required: ["raw", "name", "price", "itemId", "category"],
      },
    },
  },
  required: ["storeName", "storeId", "storeAddress", "subtotal", "total", "lines"],
};

export async function parseReceipt(image: Buffer, mimeType: string): Promise<ParsedReceipt> {
  const [items, stores] = await Promise.all([getItems(), getStores()]);

  const prompt = `Read this grocery or food receipt from New York City.
Return every purchased food or grocery line. Skip tax, totals, bag fees, deposits, coupons, and non-food items.
If a line shows quantity, return the price for ONE unit. Fix obvious abbreviations ("BNLS CHKN THI" is boneless chicken thighs).
Match to KNOWN ITEMS only when it is really the same product AND the same size, otherwise itemId null:
- A different size is a different item: a 2 lb bag of rice is not "Rice (5 lb)", a half gallon is not "Whole milk (gallon)".
- A different cut or kind is a different item: chicken breast is not chicken thighs, basmati or brown rice is not plain white rice.
- For items sold by the pound in KNOWN ITEMS (names with "(lb)"), price is per pound: "Bananas 2.1 lb $1.45" is 0.69.

KNOWN ITEMS (id: name):
${items.map((i) => `${i.id}: ${i.name}`).join("\n")}

KNOWN STORES (id: name, borough):
${stores.map((s) => `${s.id}: ${s.name}, ${s.borough}`).join("\n")}`;

  const res = await generate(
    {
      contents: [{ role: "user", parts: [{ inlineData: { mimeType, data: image.toString("base64") } }, { text: prompt }] }],
      config: { responseMimeType: "application/json", responseJsonSchema: SCHEMA, temperature: 0 },
    },
    45000,
  );

  const data = JSON.parse(res.text ?? "{}") as Partial<ParsedReceipt>;
  const itemIds = new Set(items.map((i) => i.id));
  const storeIds = new Set(stores.map((s) => s.id));

  // Never trust model output blindly: drop unknown ids and bad prices.
  const lines = (Array.isArray(data.lines) ? data.lines : [])
    .filter((l) => l && typeof l.name === "string" && l.name.trim() && Number.isFinite(l.price) && l.price >= 0 && l.price <= 1000)
    .slice(0, 60)
    .map((l) => ({
      raw: String(l.raw ?? l.name).slice(0, 80),
      name: l.name.trim().slice(0, 80),
      price: Math.round(l.price * 100) / 100,
      itemId: l.itemId && itemIds.has(l.itemId) ? l.itemId : null,
      category: CATEGORIES.includes(l.category) ? l.category : "pantry",
    }));

  const amount = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 && v < 10000 ? Math.round(v * 100) / 100 : null);
  return {
    storeId: data.storeId && storeIds.has(data.storeId) ? data.storeId : null,
    storeName: String(data.storeName ?? "").trim().slice(0, 100),
    storeAddress: String(data.storeAddress ?? "").trim().slice(0, 160),
    subtotal: amount(data.subtotal),
    total: amount(data.total),
    lines,
  };
}
