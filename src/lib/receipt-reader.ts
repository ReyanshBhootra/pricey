// Server only. The careful receipt reader, in three steps (after how Fetch reads receipts):
//  1. Read the page as a layout: header (store, address), item rows (text + price on the same
//     printed row), footer (subtotal, tax, total). No guessing about products yet.
//  2. Check the arithmetic: the rows must add up to the printed subtotal. If they don't, read
//     again, told exactly how far off it was. This catches a price paired with the wrong row.
//  3. Understand the text: printed words people already confirmed come from the receipt
//     dictionary; the rest are matched to Pricey's items by a text model with strict rules.
// receipt.ts falls back to the original one-step parser if anything here fails.
import { getItems, getReceiptWords, getStores, receiptKey } from "./data";
import { generate, READER_MODELS, RECEIPT_MODELS } from "./gemini";
import { CATEGORIES, type Category, type Item } from "./types";
import type { ParsedReceipt, ReceiptLine } from "./receipt";

interface Row {
  text: string;
  quantity: number | null;
  lineTotal: number;
  kind: "item" | "discount" | "fee" | "other";
}
interface Page {
  merchant: string;
  address: string;
  rows: Row[];
  subtotal: number | null;
  tax: number | null;
  total: number | null;
}

const money = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.round(n * 100) / 100 : null);
const cents = (n: number) => Math.round(n * 100) / 100;

const PAGE_SCHEMA = {
  type: "object",
  properties: {
    merchant: { type: "string", description: "Store name from the top of the receipt, or empty" },
    address: { type: "string", description: "Street, city, and ZIP from the top, or empty" },
    rows: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string", description: "The description exactly as printed, with sizes and codes" },
          quantity: { type: ["number", "null"], description: "Units or pounds if printed (e.g. 2 @ 1.99, 1.52 lb), else null" },
          lineTotal: { type: "number", description: "The amount in the price column on the SAME printed row (negative for discounts)" },
          kind: { type: "string", enum: ["item", "discount", "fee", "other"] },
        },
        required: ["text", "quantity", "lineTotal", "kind"],
      },
    },
    subtotal: { type: ["number", "null"] },
    tax: { type: ["number", "null"] },
    total: { type: ["number", "null"] },
  },
  required: ["merchant", "address", "rows", "subtotal", "tax", "total"],
};

const READ_PROMPT = `You are reading a paper store receipt from a photo. Read it as a 2D page, not as a stream of text.
- Top of the page: the merchant name and address.
- Middle: item rows. The description is on the left and its price is on the right of the SAME printed row. Follow each row's baseline across, even if the paper is tilted, curved, or wrinkled. Never pair a description with a price from the row above or below.
- A description can wrap onto a second line, and a quantity line ("2 @ 1.99", "1.52 lb @ 0.69/lb") can sit under its item: keep them with that item.
- Discounts or coupons under an item are kind "discount" with a negative amount. Bag fees and deposits are "fee". Lines that aren't purchases are "other".
- Bottom: subtotal, tax, and total, as printed.
Copy text and numbers exactly. Do not skip rows. Do not invent rows.`;

async function readPage(image: Buffer, mimeType: string, timeoutMs: number, hint?: string): Promise<Page> {
  const res = await generate(
    {
      contents: [{ role: "user", parts: [{ inlineData: { mimeType, data: image.toString("base64") } }, { text: hint ? `${READ_PROMPT}\n\n${hint}` : READ_PROMPT }] }],
      config: { responseMimeType: "application/json", responseJsonSchema: PAGE_SCHEMA, temperature: 0 },
    },
    timeoutMs,
    { models: READER_MODELS, budgets: [2048], startMs: timeoutMs },
  );
  const d = JSON.parse(res.text ?? "{}") as Partial<Page>;
  const rows = (Array.isArray(d.rows) ? d.rows : [])
    .filter((r) => r && typeof r.text === "string" && r.text.trim() && money(r.lineTotal) !== null && Math.abs(r.lineTotal) < 1000)
    .slice(0, 80)
    .map((r) => ({ text: r.text.trim().slice(0, 100), quantity: money(r.quantity), lineTotal: money(r.lineTotal)!, kind: (["item", "discount", "fee", "other"] as const).includes(r.kind) ? r.kind : "item" }));
  return { merchant: String(d.merchant ?? "").trim().slice(0, 100), address: String(d.address ?? "").trim().slice(0, 160), rows, subtotal: money(d.subtotal), tax: money(d.tax), total: money(d.total) };
}

// How far the rows are from the printed subtotal (or total minus tax). null: nothing to check against.
function offBy(p: Page): number | null {
  const target = p.subtotal ?? (p.total !== null && p.tax !== null ? cents(p.total - p.tax) : null);
  if (target === null) return null;
  const sum = p.rows.filter((r) => r.kind !== "other").reduce((a, r) => a + r.lineTotal, 0);
  return cents(sum - target);
}

// Discounts printed under an item come off that item.
function purchases(p: Page): { text: string; quantity: number | null; paid: number }[] {
  const out: { text: string; quantity: number | null; paid: number }[] = [];
  for (const r of p.rows) {
    if (r.kind === "item") out.push({ text: r.text, quantity: r.quantity, paid: r.lineTotal });
    else if (r.kind === "discount" && out.length) out[out.length - 1].paid = cents(out[out.length - 1].paid + r.lineTotal);
  }
  return out.filter((x) => x.paid >= 0);
}

const MATCH_SCHEMA = {
  type: "object",
  properties: {
    storeId: { type: ["string", "null"] },
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          i: { type: "integer" },
          name: { type: "string", description: "Short readable name with size, e.g. 'Chicken breast (2 lb)'" },
          itemId: { type: ["string", "null"] },
          category: { type: "string", enum: [...CATEGORIES] },
          price: { type: "number", description: "Price for ONE unit of the matched item (per lb for items sold by the pound)" },
        },
        required: ["i", "name", "itemId", "category", "price"],
      },
    },
  },
  required: ["storeId", "lines"],
};

async function understand(page: Page, rows: ReturnType<typeof purchases>, items: Item[], timeoutMs: number) {
  const stores = await getStores();
  const prompt = `These rows were read from a New York City receipt. Translate each one from "receipt speak" into a readable product, and match it to KNOWN ITEMS only when it is the same product AND the same size:
- A different size is a different item: a 2 lb bag of rice is not "Rice (5 lb)", a half gallon is not "Whole milk (gallon)".
- A different cut or kind is a different item: chicken breast is not chicken thighs, basmati or brown rice is not plain white rice.
- Otherwise itemId is null (it becomes a new item).
price is for ONE unit: divide by the quantity when several were bought; for items sold per lb (names with "(lb)"), give the price per pound.
Match the store to KNOWN STORES only if it is clearly the same location, else storeId null.

STORE: ${page.merchant || "?"}, ${page.address || "?"}
ROWS (i: printed text | quantity | amount paid):
${rows.map((r, i) => `${i}: ${r.text} | ${r.quantity ?? "-"} | ${r.paid.toFixed(2)}`).join("\n")}

KNOWN ITEMS (id: name):
${items.map((x) => `${x.id}: ${x.name}`).join("\n")}
KNOWN STORES (id: name, borough):
${stores.map((s) => `${s.id}: ${s.name}, ${s.borough}`).join("\n")}`;
  const res = await generate({ contents: [{ role: "user", parts: [{ text: prompt }] }], config: { responseMimeType: "application/json", responseJsonSchema: MATCH_SCHEMA, temperature: 0 } }, timeoutMs, {
    models: RECEIPT_MODELS,
    budgets: [0],
    startMs: timeoutMs,
  });
  const d = JSON.parse(res.text ?? "{}") as { storeId?: string | null; lines?: { i: number; name: string; itemId: string | null; category: Category; price: number }[] };
  const storeIds = new Set(stores.map((s) => s.id));
  return { storeId: d.storeId && storeIds.has(d.storeId) ? d.storeId : null, lines: Array.isArray(d.lines) ? d.lines : [] };
}

export async function readReceipt(image: Buffer, mimeType: string, deadline: number): Promise<ParsedReceipt> {
  const left = () => deadline - Date.now();

  // 1 + 2: read, check the arithmetic, and read again (once) if it doesn't add up.
  let page = await readPage(image, mimeType, Math.min(28_000, left() - 8_000));
  let off = offBy(page);
  if (off !== null && Math.abs(off) > 0.02 && left() > 26_000) {
    const sum = cents(page.rows.filter((r) => r.kind !== "other").reduce((a, r) => a + r.lineTotal, 0));
    const hint = `A first reading found these rows, but they add up to ${sum.toFixed(2)} while the receipt's subtotal is ${(page.subtotal ?? cents((page.total ?? 0) - (page.tax ?? 0))).toFixed(2)} (off by ${off.toFixed(2)}). Read every row and its price again carefully: a price may be paired with the wrong row, a row may be missing, or a digit misread (3 vs 8, 1 vs 7).
First reading: ${JSON.stringify(page.rows.map((r) => [r.text, r.lineTotal]))}`;
    const again = await readPage(image, mimeType, Math.min(25_000, left() - 8_000), hint).catch(() => null);
    const offAgain = again && offBy(again);
    if (again && offAgain !== null && Math.abs(offAgain) < Math.abs(off)) {
      page = again;
      off = offAgain;
    }
  }
  const rows = purchases(page);
  if (!rows.length) throw new Error("No purchases found on the receipt");

  // 3: the dictionary first, then the model for everything it doesn't know.
  const [items, words] = await Promise.all([getItems(), getReceiptWords()]);
  const itemById = new Map(items.map((x) => [x.id, x]));
  const matched = await understand(page, rows, items, Math.max(4_000, Math.min(12_000, left() - 1_000)));
  const lines: ReceiptLine[] = rows.map((r, i) => {
    const m = matched.lines.find((l) => l.i === i);
    const known = words.get(receiptKey(r.text));
    const learned = known && itemById.get(known.itemId);
    const unit = r.quantity && r.quantity > 1 && Number.isInteger(r.quantity) ? cents(r.paid / r.quantity) : r.paid;
    const price = m && Number.isFinite(m.price) && m.price >= 0 && m.price <= 1000 ? cents(m.price) : unit;
    const itemId = learned ? learned.id : m?.itemId && itemById.has(m.itemId) ? m.itemId : null;
    return {
      raw: r.text.slice(0, 80),
      name: (learned?.name ?? m?.name ?? r.text).trim().slice(0, 80),
      price,
      itemId,
      category: learned?.category ?? (m && CATEGORIES.includes(m.category) ? m.category : "pantry"),
    };
  });
  return {
    storeId: matched.storeId,
    storeName: page.merchant,
    storeAddress: page.address,
    subtotal: page.subtotal,
    total: page.total,
    lines,
    checked: off === null ? null : Math.abs(off) <= 0.02,
    reader: "careful",
  };
}
