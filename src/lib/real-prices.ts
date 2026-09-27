// Real prices scraped from store websites (see docs/REAL_PRICES.md). `npm run import:prices`
// checks data/stores.csv and data/prices.csv and writes real-prices.json, which ships with the
// app. The data layer merges it in on every read, so it works the same with or without Firebase
// and goes live with a normal deploy. Crowd reports then vote on top of it like any other price.
import { inNyc } from "./format";
import IMPORTED from "./real-prices.json";
import { SEED_ITEMS, SEED_REPORTS, SEED_STORES } from "./seed";
import { BOROUGHS, type Borough, type Report, type Store } from "./types";

export interface RealPrices {
  importedAt: number | null;
  onlyReal: boolean; // hide the made-up demo stores and prices entirely
  stores: Store[];
  reports: Report[];
}

// ---------- reading the CSVs ----------

// RFC 4180: quoted fields, doubled quotes, commas and newlines inside quotes, CRLF, BOM.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim()));
}

// Rows as objects keyed by lowercase header; line numbers match the file (header is line 1).
function table(text: string, required: string[], file: string, errors: string[]) {
  const [head, ...rows] = parseCsv(text);
  const cols = (head ?? []).map((h) => h.trim().toLowerCase());
  const missing = required.filter((c) => !cols.includes(c));
  if (missing.length) errors.push(`${file}: missing column${missing.length > 1 ? "s" : ""} ${missing.join(", ")} (found: ${cols.join(", ") || "nothing"})`);
  return rows.map((r, i) => ({ line: i + 2, get: (k: string) => (r[cols.indexOf(k)] ?? "").trim() }));
}

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DAY = 24 * 60 * 60_000;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

export const domainOf = (url?: string) => {
  try {
    // "locations.traderjoes.com" -> "traderjoes.com": one site, one name.
    return url ? new URL(url).hostname.split(".").slice(-2).join(".") : null;
  } catch {
    return null;
  }
};

export interface ImportCheck {
  data: RealPrices;
  errors: string[]; // the import stops if there are any
  warnings: string[]; // worth a look, but loaded
}

export function checkImport(storesCsv: string, pricesCsv: string, opts: { now?: number; onlyReal?: boolean } = {}): ImportCheck {
  const now = opts.now ?? Date.now();
  const errors: string[] = [];
  const warnings: string[] = [];
  const url = (v: string, where: string) => {
    if (!v) return undefined;
    if (/^https?:\/\/[^\s]+\.[^\s]+$/i.test(v) && domainOf(v)) return v;
    warnings.push(`${where}: source_url "${v}" isn't a web link, ignoring it`);
    return undefined;
  };

  // Stores
  const stores: Store[] = [];
  for (const { line, get } of table(storesCsv, ["store_id", "name", "borough", "lat", "lng"], "stores.csv", errors)) {
    const at = `stores.csv line ${line}`;
    const id = get("store_id").toLowerCase();
    const name = get("name");
    const borough = BOROUGHS.find((b) => b.toLowerCase() === get("borough").toLowerCase()) as Borough | undefined;
    const lat = Number(get("lat"));
    const lng = Number(get("lng"));
    const bad: string[] = [];
    if (!ID.test(id) || id.length > 80) bad.push(`store_id "${id}" should be lowercase words with dashes`);
    if (stores.some((s) => s.id === id)) bad.push(`store_id "${id}" is listed twice`);
    if (!name || name.length > 100) bad.push("name is missing or too long");
    if (!borough) bad.push(`borough "${get("borough")}" should be one of ${BOROUGHS.join(", ")}`);
    if (!get("lat") || !get("lng") || !inNyc(lat, lng)) bad.push(`lat/lng ${get("lat")}, ${get("lng")} isn't in NYC (lat is about 40.5 to 40.9, lng about -74.3 to -73.7)`);
    if (bad.length) {
      errors.push(`${at}: ${bad.join("; ")}`);
      continue;
    }
    const address = get("address") || undefined;
    stores.push({ id, name, borough: borough!, lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5, ...(address && { address }), ...(url(get("source_url"), at) && { sourceUrl: get("source_url") }) });
  }

  // Prices
  const items = new Map(SEED_ITEMS.map((i) => [i.id, i]));
  const storeIds = new Set([...stores.map((s) => s.id), ...(opts.onlyReal ? [] : SEED_STORES.map((s) => s.id))]);
  const typical = new Map(SEED_ITEMS.map((i) => [i.id, median(SEED_REPORTS.filter((r) => r.itemId === i.id && r.type === "price").map((r) => r.price))]));
  const reports: Report[] = [];
  let old = 0;
  for (const { line, get } of table(pricesCsv, ["store_id", "item_id", "price", "scraped_at"], "prices.csv", errors)) {
    const at = `prices.csv line ${line}`;
    const storeId = get("store_id").toLowerCase();
    const itemId = get("item_id").toLowerCase();
    const price = Number(get("price").replace(/^\$/, ""));
    const saleText = get("sale_price").replace(/^\$/, "");
    const sale = saleText ? Number(saleText) : null;
    const date = get("scraped_at");
    const day = /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(`${date}T12:00:00-04:00`) : NaN;
    const bad: string[] = [];
    if (!storeIds.has(storeId)) bad.push(`store_id "${storeId}" isn't in stores.csv`);
    if (!items.has(itemId)) bad.push(`item_id "${itemId}" isn't one of the 16 (see docs/REAL_PRICES.md)`);
    if (!get("price") || !Number.isFinite(price) || price <= 0 || price > 200) bad.push(`price "${get("price")}" should be a number like 3.49`);
    if (sale !== null && (!Number.isFinite(sale) || sale <= 0 || sale > 200)) bad.push(`sale_price "${saleText}" should be a number or empty`);
    if (!Number.isFinite(day)) bad.push(`scraped_at "${date}" should look like 2026-09-26`);
    else if (day > now + DAY) bad.push(`scraped_at ${date} is in the future`);
    if (reports.some((r) => r.storeId === storeId && r.itemId === itemId)) bad.push(`${storeId} + ${itemId} is listed twice`);
    if (bad.length) {
      errors.push(`${at}: ${bad.join("; ")}`);
      continue;
    }
    if (sale !== null && sale >= price) warnings.push(`${at}: sale_price ${sale} isn't lower than price ${price}, using ${price}`);
    const paid = sale !== null && sale < price ? sale : price;
    // Catches unit mix-ups (per ounce, a half gallon not converted, a 10 lb bag).
    const t = typical.get(itemId);
    if (t && (paid < t / 3 || paid > t * 3)) warnings.push(`${at}: ${items.get(itemId)!.name} at $${paid.toFixed(2)} is far from the usual ~$${t.toFixed(2)}. Check the unit (listed as "${get("listed_as") || "?"}")`);
    if (now - day > 30 * DAY) old++;
    const source = url(get("source_url"), at) ?? stores.find((s) => s.id === storeId)?.sourceUrl;
    reports.push({
      id: `import-${storeId}-${itemId}`,
      itemId,
      storeId,
      price: Math.round(paid * 100) / 100,
      timestamp: day,
      userId: `import:${domainOf(source) ?? "store-site"}`,
      type: "price",
      ...(paid < price && { note: `On sale, usually $${price.toFixed(2)}` }),
      ...(source && { sourceUrl: source }),
    });
  }
  if (old) warnings.push(`${old} price${old > 1 ? "s are" : " is"} more than 30 days old. Pricey only trusts the last 30 days, so those won't show. Re-scrape to refresh.`);

  const unused = stores.filter((s) => !reports.some((r) => r.storeId === s.id));
  if (unused.length) warnings.push(`No prices for ${unused.map((s) => s.id).join(", ")}; they'll show up as stores with no prices yet.`);
  return { data: { importedAt: now, onlyReal: !!opts.onlyReal, stores, reports }, errors, warnings };
}

// ---------- merging into what the app reads ----------

const real = IMPORTED as RealPrices;
const realStores = new Map(real.stores.map((s) => [s.id, s]));
const realPairs = new Set(real.reports.map((r) => `${r.storeId}|${r.itemId}`));
const realStoreIds = new Set([...realStores.keys(), ...real.reports.map((r) => r.storeId)]);
const isDemo = (r: Report) => r.userId.startsWith("seed-") || r.userId.startsWith("demo-");

export const hasRealPrices = real.reports.length > 0;
export const realImportedAt = real.importedAt;

// Stores: imported ones override demo ones with the same id; demo-only stores go in "only real" mode.
export function mergeStores(stores: Store[]): Store[] {
  if (!realStores.size && !real.onlyReal) return stores;
  const kept = stores.filter((s) => !realStores.has(s.id) && (!real.onlyReal || realStoreIds.has(s.id) || !SEED_STORES.some((d) => d.id === s.id)));
  const merged = [...kept, ...stores.filter((s) => realStores.has(s.id)).map((s) => ({ ...s, ...realStores.get(s.id)! }))];
  for (const s of realStores.values()) if (!merged.some((m) => m.id === s.id)) merged.push(s);
  return merged;
}

export function mergeStore(store: Store | null, id: string): Store | null {
  const r = realStores.get(id);
  if (r) return { ...store, ...r };
  if (store && real.onlyReal && !realStoreIds.has(id) && SEED_STORES.some((d) => d.id === id)) return null;
  return store;
}

// Reports: made-up demo votes step aside wherever there's a real price (so fake reporters can't
// outvote it), or everywhere in "only real" mode. Real prices matching `keep` are added.
export function mergeReports(rows: Report[], keep: (r: Report) => boolean = () => true): Report[] {
  if (!real.reports.length && !real.onlyReal) return rows;
  const out = rows.filter((r) => {
    if (!isDemo(r)) return true;
    if (real.onlyReal) return r.type === "event" ? realStoreIds.has(r.storeId) : false;
    return r.type !== "price" || !realPairs.has(`${r.storeId}|${r.itemId}`);
  });
  const have = new Set(out.map((r) => r.id));
  for (const r of real.reports) if (keep(r) && !have.has(r.id)) out.push(r);
  return out;
}
