// Tests the careful receipt reader with a stand-in for Gemini that replays a real receipt
// (Green Leaf Market, subtotal $45.69). Its first reading misreads one price, like the real
// model did, so we can check the arithmetic check, the re-read, the dictionary, and the fallback.
//   npm run test:receipt
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

type Row = [string, number];
const TRUE_ROWS: Row[] = [
  ["Bananas (1 lb)", 0.69],
  ["Whole Milk (1 gal)", 4.29],
  ["Eggs, Large (dozen)", 3.99],
  ["Bread, Whole Wheat", 3.49],
  ["Chicken Breast (2 lb)", 8.98],
  ["Rice, Basmati (2 lb)", 5.49],
  ["Olive Oil (16 oz)", 7.99],
  ["Spinach (1 bag)", 2.99],
  ["Greek Yogurt (32 oz)", 5.29],
  ["Tomatoes (1 lb)", 2.49],
];
const MISREAD: Row[] = TRUE_ROWS.map(([t, p]) => [t, t.startsWith("Chicken") ? 9.09 : p]); // adds up to 45.80

let mode: "normal" | "reader-down" = "normal";
const calls: string[] = [];

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const j = JSON.parse(body || "{}");
    const parts = (j.contents ?? []).flatMap((c: { parts?: unknown[] }) => c.parts ?? []) as { text?: string; inlineData?: unknown }[];
    const text = parts.map((p) => p.text ?? "").join("\n");
    const schema = JSON.stringify(j.generationConfig?.responseJsonSchema ?? {});
    const send = (obj: unknown) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(obj) }] }, finishReason: "STOP", index: 0 }] }));
    };
    const page = (rows: Row[]) => ({ merchant: "GREEN LEAF MARKET", address: "123 Amsterdam Ave, New York, NY 10027", rows: rows.map(([t, p]) => ({ text: t, quantity: null, lineTotal: p, kind: "item" })), subtotal: 45.69, tax: 2.06, total: 47.75 });

    if (schema.includes('"rows"')) {
      // Step 1 and 2: reading the page.
      if (mode === "reader-down") {
        calls.push("read:down");
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { code: 500, message: "internal", status: "INTERNAL" } }));
      }
      const second = text.includes("First reading");
      calls.push(second ? "read:again" : "read:first");
      return send(page(second ? TRUE_ROWS : MISREAD));
    }
    if (schema.includes('"i"')) {
      // Step 3: understanding the text. Leaves bread unmatched so the dictionary has to win.
      calls.push("understand");
      const ids: Record<string, string | null> = { Bananas: "bananas-lb", "Whole Milk": "milk-gallon", "Eggs, Large": "eggs-dozen" };
      const rows = [...text.matchAll(/^(\d+): (.+?) \| (.+?) \| ([\d.]+)$/gm)];
      return send({
        storeId: null,
        lines: rows.map((m) => {
          const key = Object.keys(ids).find((k) => m[2].startsWith(k));
          return { i: Number(m[1]), name: m[2], itemId: key ? ids[key] : null, category: "pantry", price: Number(m[4]) };
        }),
      });
    }
    // The original one-step parser (fallback).
    calls.push("basic");
    return send({ storeName: "GREEN LEAF MARKET", storeId: null, storeAddress: "", subtotal: 45.69, total: 47.75, lines: TRUE_ROWS.map(([t, p]) => ({ raw: t, name: t, price: p, itemId: null, category: "pantry" })) });
  });
});

async function main() {
  await new Promise<void>((r) => server.listen(0, r));
  process.env.GEMINI_BASE_URL = `http://localhost:${(server.address() as AddressInfo).port}`;
  process.env.GEMINI_API_KEY = "test";
  const { parseReceipt } = await import("../src/lib/receipt");
  const { learnReceiptWords } = await import("../src/lib/data");
  const photo = Buffer.from("fake image");

  // Someone confirmed before that this store's "Bread, Whole Wheat" is our sliced bread.
  await learnReceiptWords([{ raw: "Bread, Whole Wheat", itemId: "bread-loaf" }]);

  const r = await parseReceipt(photo, "image/jpeg");
  assert.equal(r.reader, "careful");
  assert.deepEqual(calls.slice(0, 3), ["read:first", "read:again", "understand"], "misread total triggers exactly one re-read");
  assert.equal(r.checked, true, "second reading adds up to the subtotal");
  assert.equal(r.lines.length, 10);
  assert.equal(r.lines.find((l) => l.raw.startsWith("Chicken"))?.price, 8.98, "the misread price is corrected");
  assert.equal(Math.round(r.lines.reduce((a, l) => a + l.price, 0) * 100) / 100, 45.69);
  assert.equal(r.subtotal, 45.69);
  assert.equal(r.total, 47.75);
  assert.equal(r.storeAddress, "123 Amsterdam Ave, New York, NY 10027");
  assert.equal(r.lines.find((l) => l.raw.startsWith("Bread"))?.itemId, "bread-loaf", "the learned dictionary beats the model");
  assert.equal(r.lines.find((l) => l.raw.startsWith("Rice"))?.itemId, null, "2 lb basmati is not the 5 lb rice");
  assert.equal(r.lines.find((l) => l.raw.startsWith("Chicken"))?.itemId, null, "chicken breast is not chicken thighs");
  console.log("PASS careful reader: misread caught, re-read, adds up to $45.69, dictionary used");

  // The careful reader breaks: the original parser still answers.
  mode = "reader-down";
  calls.length = 0;
  const fb = await parseReceipt(photo, "image/jpeg");
  assert.equal(fb.reader, "basic");
  assert.ok(calls.includes("basic"));
  assert.equal(fb.lines.length, 10);
  console.log("PASS falls back to the original parser when the careful reader fails");

  // RECEIPT_READER=basic: straight to the original.
  mode = "normal";
  calls.length = 0;
  process.env.RECEIPT_READER = "basic";
  const basic = await parseReceipt(photo, "image/jpeg");
  assert.equal(basic.reader, "basic");
  assert.deepEqual(calls, ["basic"]);
  console.log("PASS RECEIPT_READER=basic switches back entirely");

  console.log("receipt OK");
  server.close();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
