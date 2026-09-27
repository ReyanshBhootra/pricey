// Real prices scraped from store websites (see docs/REAL_PRICES.md). `npm run import:prices`
// checks data/stores.csv and data/prices.csv and writes real-prices.json, which ships with the
// app. The data layer merges it in on every read, so it works the same with or without Firebase
// and goes live with a normal deploy. Crowd reports then vote on top of it like any other price.
import { inNyc } from "./format";
import { distanceKm } from "./vouch";
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

// One store or price row, whichever file it came from. `at` says where, for error messages.
type Row = { at: string; get: (k: string) => string };

// CSV rows keyed by lowercase header; line numbers match the file (header is line 1).
function table(text: string, required: string[], file: string, errors: string[]): Row[] {
  const [head, ...rows] = parseCsv(text);
  const cols = (head ?? []).map((h) => h.trim().toLowerCase());
  const missing = required.filter((c) => !cols.includes(c));
  if (missing.length) errors.push(`${file}: missing column${missing.length > 1 ? "s" : ""} ${missing.join(", ")} (found: ${cols.join(", ") || "nothing"})`);
  return rows.map((r, i) => ({ at: `${file} line ${i + 2}`, get: (k: string) => (r[cols.indexOf(k)] ?? "").trim() }));
}

// ids like "keyfood_522" become "keyfood-522".
const normId = (v: string) => v.trim().toLowerCase().replace(/[_\s]+/g, "-");

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

type ImportOptions = { now?: number; onlyReal?: boolean };

// data/stores.csv + data/prices.csv (the format in docs/REAL_PRICES.md).
export function checkImport(storesCsv: string, pricesCsv: string, opts: ImportOptions = {}): ImportCheck {
  const errors: string[] = [];
  const stores = table(storesCsv, ["store_id", "name", "borough", "lat", "lng"], "stores.csv", errors);
  const prices = table(pricesCsv, ["store_id", "item_id", "price", "scraped_at"], "prices.csv", errors);
  return checkRows(stores, prices, opts, errors);
}

// One JSON file: { stores: [...], observations: [...] }, the scraper's own format. Accepts both
// the fields we asked for (regular_price_usd, promo_price_usd, promo_conditions, observed_date)
// and the older flyer-only ones (price_usd, source_offer_details, borough_as_reported).
export function checkImportJson(text: string, opts: ImportOptions = {}): ImportCheck {
  const errors: string[] = [];
  let doc: { stores?: unknown; observations?: unknown; prices?: unknown };
  try {
    doc = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch (e) {
    errors.push(`The file isn't valid JSON: ${e instanceof Error ? e.message : e}`);
    return checkRows([], [], opts, errors);
  }
  const list = (v: unknown, name: string) => {
    if (Array.isArray(v)) return v as Record<string, unknown>[];
    errors.push(`The file needs a "${name}" list`);
    return [];
  };
  const pick = (o: Record<string, unknown>, ...keys: string[]) => {
    for (const k of keys) if (o[k] !== null && o[k] !== undefined && String(o[k]).trim() !== "") return String(o[k]).trim();
    return "";
  };
  const stores = list(doc.stores, "stores").map((o, i): Row => {
    const f: Record<string, string> = {
      store_id: pick(o, "store_id"),
      name: pick(o, "name"),
      address: pick(o, "address").includes(pick(o, "postal_code")) ? pick(o, "address") : [pick(o, "address"), pick(o, "postal_code")].filter(Boolean).join(", "),
      borough: pick(o, "borough", "borough_as_reported"),
      lat: pick(o, "lat", "latitude"),
      lng: pick(o, "lng", "lon", "longitude"),
      source_url: pick(o, "source_url"),
    };
    return { at: `stores[${i}]${f.store_id ? ` (${f.store_id})` : ""}`, get: (k) => f[k] ?? "" };
  });
  // Online store listings count too: an online price is still the store's own price, and
  // shoppers correct it by voting if the shelf says otherwise.
  const d = doc as Record<string, unknown>;
  const observed = [...list(doc.observations ?? doc.prices ?? [], "observations"), ...(Array.isArray(d.online_price_candidates) ? (d.online_price_candidates as Record<string, unknown>[]) : [])];
  const firstCandidate = observed.length - (Array.isArray(d.online_price_candidates) ? d.online_price_candidates.length : 0);
  const prices = observed.map((o, i): Row => {
    const f: Record<string, string> = {
      store_id: pick(o, "store_id"),
      item_id: pick(o, "item_id"),
      price: pick(o, "regular_price_usd", "normalized_online_regular_price_usd", "online_regular_package_price_usd", "price"),
      sale_price: pick(o, "promo_price_usd", "normalized_online_promo_price_usd", "online_promo_package_price_usd", "sale_price", "normalized_price_per_package_usd", "price_usd"),
      conditions: pick(o, "promo_conditions", "conditions", "source_offer_details"),
      listed_as: pick(o, "package_description", "listed_as"),
      source_url: pick(o, "source_url"),
      scraped_at: pick(o, "observed_date", "scraped_at"),
    };
    const at = i < firstCandidate ? `observations[${i}]` : `online_price_candidates[${i - firstCandidate}]`;
    return { at: `${at} (${f.store_id} + ${f.item_id})`, get: (k) => f[k] ?? "" };
  });
  return checkRows(stores, prices, opts, errors);
}

function checkRows(storeRows: Row[], priceRows: Row[], opts: ImportOptions, errors: string[]): ImportCheck {
  const now = opts.now ?? Date.now();
  const warnings: string[] = [];
  const url = (v: string, where: string) => {
    if (!v) return undefined;
    if (/^https?:\/\/[^\s]+\.[^\s]+$/i.test(v) && domainOf(v)) return v;
    warnings.push(`${where}: source_url "${v}" isn't a web link, ignoring it`);
    return undefined;
  };

  // Stores
  const stores: Store[] = [];
  const sameAs = new Map<string, string>(); // imported store id -> demo store id it replaced
  const brokenStores = new Set<string>(); // already reported; their price rows aren't repeated
  for (const { at, get } of storeRows) {
    const id = normId(get("store_id"));
    const name = get("name");
    const borough = BOROUGHS.find((b) => b.toLowerCase() === get("borough").toLowerCase()) as Borough | undefined;
    const lat = Number(get("lat"));
    const lng = Number(get("lng"));
    const bad: string[] = [];
    if (!ID.test(id) || id.length > 80) bad.push(`store_id "${id}" should be lowercase words with dashes`);
    if (stores.some((s) => s.id === id)) bad.push(`store_id "${id}" is listed twice`);
    if (!name || name.length > 100) bad.push("name is missing or too long");
    if (!borough) bad.push(`borough "${get("borough")}" should be one of ${BOROUGHS.join(", ")}`);
    if (!get("lat") || !get("lng")) bad.push("lat and lng are missing");
    else if (!inNyc(lat, lng)) bad.push(`lat/lng ${get("lat")}, ${get("lng")} isn't in NYC (lat is about 40.5 to 40.9, lng about -74.3 to -73.7)`);
    if (bad.length) {
      errors.push(`${at}: ${bad.join("; ")}`);
      brokenStores.add(id);
      continue;
    }
    const address = get("address") || undefined;
    // The same place as a demo store (same chain, a few blocks at most): take over its id, so
    // there's one pin with the real address instead of two.
    const chain = (n: string) => n.split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, "");
    const twin = SEED_STORES.find((d) => chain(d.name) === chain(name) && distanceKm(d.lat, d.lng, lat, lng) < 0.5 && !stores.some((s) => s.id === d.id));
    if (twin) {
      sameAs.set(id, twin.id);
      warnings.push(`${at}: same store as the demo "${twin.name}", merged into one`);
    }
    stores.push({ id: twin?.id ?? id, name, borough: borough!, lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5, ...(address && { address }), ...(url(get("source_url"), at) && { sourceUrl: get("source_url") }) });
  }

  // Prices
  const items = new Map(SEED_ITEMS.map((i) => [i.id, i]));
  const storeIds = new Set([...stores.map((s) => s.id), ...(opts.onlyReal ? [] : SEED_STORES.map((s) => s.id))]);
  const typical = new Map(SEED_ITEMS.map((i) => [i.id, median(SEED_REPORTS.filter((r) => r.itemId === i.id && r.type === "price").map((r) => r.price))]));
  const reports: Report[] = [];
  let old = 0;
  for (const { at, get } of priceRows) {
    const rawStoreId = normId(get("store_id"));
    const storeId = sameAs.get(rawStoreId) ?? rawStoreId;
    const itemId = normId(get("item_id"));
    const hasRegular = !!get("price");
    const price = Number(get("price").replace(/^\$/, ""));
    const saleText = get("sale_price").replace(/^\$/, "");
    const sale = saleText ? Number(saleText) : null;
    const date = get("scraped_at");
    const day = /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(`${date}T12:00:00-04:00`) : NaN;
    const bad: string[] = [];
    const storeBroken = brokenStores.has(storeId) && !storeIds.has(storeId);
    if (!storeIds.has(storeId) && !storeBroken) bad.push(`store_id "${storeId}" isn't in the store list`);
    if (!items.has(itemId)) bad.push(`item_id "${itemId}" isn't one of the 16 (see docs/REAL_PRICES.md)`);
    if (!hasRegular && sale === null) bad.push("no price");
    else if (hasRegular && (!Number.isFinite(price) || price <= 0 || price > 200)) bad.push(`price "${get("price")}" should be a number like 3.49`);
    if (sale !== null && (!Number.isFinite(sale) || sale <= 0 || sale > 200)) bad.push(`sale_price "${saleText}" should be a number or empty`);
    if (!Number.isFinite(day)) bad.push(`scraped_at "${date}" should look like 2026-09-26`);
    else if (day > now + DAY) bad.push(`scraped_at ${date} is in the future`);
    if (reports.some((r) => r.storeId === storeId && r.itemId === itemId)) bad.push(`${storeId} + ${itemId} is listed twice`);
    if (bad.length) {
      errors.push(`${at}: ${bad.join("; ")}`);
      continue;
    }
    if (storeBroken) continue; // the store's own error already covers it
    if (hasRegular && sale !== null && sale >= price) warnings.push(`${at}: sale_price ${sale} isn't lower than price ${price}, using ${price}`);
    // A deal you can only get by buying several ("must buy 10") isn't the price of one, so the
    // regular price stays and the deal goes in the note. Other sales are the price you pay.
    // Big purchase caps ("maximum 100 lb") aren't worth telling anyone about.
    const conditions = get("conditions")
      .replace(/\s+/g, " ")
      .split(/;\s*/)
      .filter((c) => c && !/^(maximum|max|limit)\s+\d{2,}/i.test(c))
      .join("; ")
      .slice(0, 90);
    const multiBuy = /must buy|minimum/i.test(conditions);
    const onSale = sale !== null && (!hasRegular || (sale < price && !multiBuy));
    const paid = onSale ? sale! : price;
    const cents = (n: number) => `$${n.toFixed(2)}`;
    const note = onSale
      ? [conditions ? `Deal: ${conditions}` : "On sale", hasRegular && `usually ${cents(price)}`].filter(Boolean).join(", ")
      : sale !== null && sale < price
        ? `Deal: ${cents(sale)} each${conditions ? ` (${conditions})` : ""}`
        : undefined;
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
      ...(note && { note }),
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

// ---------- estimates for the gaps ----------

// Fills items nobody found a real price for at an imported store, from a per-chain table
// (data/estimates.json). Marked as Pricey's own estimate: the app shows "est." and asks
// shoppers to confirm, and any real report outvotes it.
export function addEstimates(data: RealPrices, chains: Record<string, Record<string, number>>, now = Date.now()): { added: number; chainsMissing: string[] } {
  const chainOf = (name: string) => name.split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, "");
  const items = new Set(SEED_ITEMS.map((i) => i.id));
  const have = new Set(data.reports.map((r) => `${r.storeId}|${r.itemId}`));
  const chainsMissing = new Set<string>();
  let added = 0;
  for (const store of data.stores) {
    const table = chains[chainOf(store.name)];
    if (!table) {
      chainsMissing.add(store.name);
      continue;
    }
    for (const [itemId, price] of Object.entries(table)) {
      if (!items.has(itemId) || !(price > 0 && price < 200) || have.has(`${store.id}|${itemId}`)) continue;
      data.reports.push({ id: `estimate-${store.id}-${itemId}`, itemId, storeId: store.id, price: Math.round(price * 100) / 100, timestamp: now, userId: "estimate:pricey", type: "price", note: "Estimate" });
      added++;
    }
  }
  return { added, chainsMissing: [...chainsMissing] };
}
