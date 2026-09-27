import { BadgePercent, ChevronDown, ChevronRight, ListChecks, Store } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { CategoryIcon } from "@/components/category";
import { chipClass } from "@/components/chip";
import { ItemSearch } from "@/components/item-search";
import { LiveRefresh } from "@/components/live-refresh";
import { LocationPicker } from "@/components/location-picker";
import { PriceMap } from "@/components/price-map";
import { getMapStores } from "@/lib/map-data";
import { Price } from "@/components/price";
import { ShowMore } from "@/components/show-more";
import { Ticker, type Tick } from "@/components/ticker";
import { TrackedAlerts } from "@/components/tracked-alerts";
import {
  getActiveEvents,
  getItems,
  getNearbyStores,
  getPriceChanges,
  getPricesForStores,
  getStores,
} from "@/lib/data";
import { miles, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DEFAULT_WHERE, getWhere, isExact, nearText } from "@/lib/where";
import { CATEGORIES, type Category, type TrustedPrice } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Nearby({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const str = (k: string) =>
    typeof sp[k] === "string" ? (sp[k] as string) : undefined;
  // Where they're shopping from, shared with every page (see lib/where.ts).
  const saved = await getWhere();
  const where = saved ?? DEFAULT_WHERE;
  const { lat, lng } = where;
  const cat = CATEGORIES.includes(str("cat") as Category)
    ? (str("cat") as Category)
    : undefined;
  const view = str("view") === "map" ? "map" : "list";

  // A borough: its stores. A real place: stores within about 2 miles, or the 5 closest.
  let nearby =
    where.kind === "borough"
      ? (await getNearbyStores(lat, lng, 100)).filter((s) => s.borough === where.borough)
      : await getNearbyStores(lat, lng, 3);
  if (nearby.length < 3)
    nearby = (await getNearbyStores(lat, lng, 100)).slice(0, 5);

  const [items, stores, prices, allEvents, changes] = await Promise.all([
    getItems(),
    getStores(),
    getPricesForStores(
      nearby.map((s) => s.id),
      cat,
    ),
    // Deals within about 3 miles of a real place, or anywhere in the borough.
    getActiveEvents(isExact(where) ? { hours: 24, lat, lng, radiusKm: 5 } : { hours: 24 }),
    getPriceChanges({ hours: 48 }),
  ]);
  // With a category filter on, skip stores with nothing in it (unless that leaves nothing).
  if (cat && nearby.some((s) => prices.get(s.id)?.length))
    nearby = nearby.filter((s) => prices.get(s.id)?.length);
  const boroughOf = new Map(stores.map((s) => [s.id, s.borough]));
  const events = isExact(where) ? allEvents : allEvents.filter((e) => boroughOf.get(e.storeId) === where.borough);
  const itemName = new Map(items.map((i) => [i.id, i.name]));
  const storeName = new Map(stores.map((s) => [s.id, s.name]));
  const eventSpots = new Set(events.map((e) => e.storeId)).size;

  const viewHref = (v: "list" | "map") => {
    const q = new URLSearchParams();
    if (cat) q.set("cat", cat);
    if (v === "map") q.set("view", "map");
    return `/?${q}`;
  };
  const mapStores =
    view === "map"
      ? await getMapStores(isExact(where) ? { lat, lng } : null)
      : [];

  const catHref = (c?: Category) => {
    const q = new URLSearchParams();
    if (c) q.set("cat", c);
    if (view === "map") q.set("view", "map");
    return `/?${q}`;
  };

  const itemCategory = new Map(items.map((i) => [i.id, i.category]));
  // Ticker: what just moved across the city, then the cheapest spot for each item nearby.
  const cheapestNearby = new Map<string, TrustedPrice>();
  for (const list of prices.values())
    for (const p of list) {
      const best = cheapestNearby.get(p.itemId);
      if (!p.estimated && (!best || p.price < best.price)) cheapestNearby.set(p.itemId, p);
    }
  const ticks: Tick[] = [
    ...changes.slice(0, 6).map((c) => ({
      key: c.id,
      href: `/item/${c.itemId}`,
      name: itemName.get(c.itemId) ?? c.itemId,
      price: c.newPrice,
      was: c.oldPrice,
      where: storeName.get(c.storeId) ?? c.storeId,
    })),
    ...[...cheapestNearby.values()].slice(0, 10).map((p) => ({
      key: `low-${p.itemId}`,
      href: `/item/${p.itemId}`,
      name: itemName.get(p.itemId) ?? p.itemId,
      price: p.price,
      where: storeName.get(p.storeId) ?? p.storeId,
    })),
  ];

  const row = (p: TrustedPrice) => (
    <li key={p.itemId}>
      <Link href={`/item/${p.itemId}`} className="group flex items-center gap-3 py-2">
        <CategoryIcon category={itemCategory.get(p.itemId) ?? ""} className="size-7" />
        <span className="min-w-0 flex-1 truncate group-hover:underline">{itemName.get(p.itemId) ?? p.itemId}</span>
        <span className="w-12 shrink-0 text-right text-xs text-muted-foreground">{p.estimated ? "estimate" : p.votes === 1 ? "1 report" : `${p.votes} agree`}</span>
        <Price value={p.price} className="w-16 shrink-0 text-right text-lg" />
      </Link>
    </li>
  );

  return (
    <>
      <LiveRefresh name="reports" />
      <section className="mb-5 overflow-hidden rounded-[1.75rem] bg-hero text-hero-foreground lg:mb-8">
        <div className="px-5 pt-6 pb-5 lg:grid lg:grid-cols-[1.1fr_1fr] lg:items-end lg:gap-10 lg:px-10 lg:pt-10 lg:pb-9">
          <div>
            <h1 className="mb-2 text-[2.6rem] leading-[0.95] lg:text-[4.25rem]">Real prices {nearText(where)}</h1>
            <p className="mb-5 text-hero-muted lg:mb-0 lg:text-lg">Reported by New Yorkers. The price most people agree on wins.</p>
          </div>
          <ItemSearch items={items} />
        </div>
        {ticks.length > 0 && (
          <div className="flex items-center gap-3 border-t border-white/10 py-2 pl-5 lg:pl-10">
            <span className="flex shrink-0 items-center gap-1.5 text-xs font-bold text-lime">
              <span className="relative flex size-2">
                <span className="absolute inset-0 animate-ping rounded-full bg-lime opacity-75 motion-reduce:animate-none" />
                <span className="relative size-2 rounded-full bg-lime" />
              </span>
              Live
            </span>
            <Ticker ticks={ticks} />
          </div>
        )}
      </section>

      {/* Laptop and up: where/alerts/deals in a sticky sidebar, stores in the wide column. */}
      <div className="lg:grid lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start lg:gap-8">
        <aside className="lg:sticky lg:top-20 lg:-m-1 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:p-1">
          <Suspense>
            <LocationPicker where={saved && { label: saved.label, kind: saved.kind }} />
          </Suspense>

          <TrackedAlerts
            changes={changes.map((c) => ({
              ...c,
              itemName: itemName.get(c.itemId) ?? c.itemId,
              storeName: storeName.get(c.storeId) ?? c.storeId,
            }))}
          />

          {events.length > 0 && (
            <details className="group mb-5 overflow-hidden rounded-[1.5rem] bg-tangerine text-tangerine-foreground">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60">
                <BadgePercent className="size-7 shrink-0" strokeWidth={2} />
                <span className="font-display text-xl leading-tight">
                  {eventSpots} {eventSpots === 1 ? "spot" : "spots"} {nearText(where)} {eventSpots === 1 ? "has" : "have"} deals right now
                </span>
                <ChevronDown className="ml-auto size-5 shrink-0 transition-transform duration-300 group-open:rotate-180" />
              </summary>
              <ul className="mx-1.5 mb-1.5 divide-y rounded-[1.1rem] bg-card text-sm text-card-foreground group-open:animate-in group-open:fade-in group-open:slide-in-from-top-2">
                {events.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-3.5 py-3">
                    <div className="min-w-0 flex-1">
                      <Link href={`/store/${e.storeId}`} className="font-semibold hover:underline">
                        {storeName.get(e.storeId) ?? e.storeId}
                      </Link>
                      <p>
                        {e.note ?? itemName.get(e.itemId)} <span className="text-muted-foreground">{timeAgo(e.timestamp)}</span>
                      </p>
                    </div>
                    <Price value={e.price} className="shrink-0 text-lg" />
                  </li>
                ))}
              </ul>
            </details>
          )}

          <Link
            href="/list"
            className="group mb-6 flex items-center gap-3 rounded-[1.25rem] border bg-card p-3 pr-4 transition-colors hover:border-foreground/30"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-lime text-lime-foreground">
              <ListChecks className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold">Plan a shopping list</span>
              <span className="block text-sm text-muted-foreground">The cheapest trip, with subway fares counted</span>
            </span>
            <ChevronRight className="ml-auto size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        </aside>

        <div className="min-w-0">

          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-display text-2xl">Stores {nearText(where)}</h2>
            <div className="flex shrink-0 rounded-full border bg-card p-1 text-sm font-semibold" role="tablist" aria-label="View">
              {(["list", "map"] as const).map((v) => (
                <Link
                  key={v}
                  href={viewHref(v)}
                  scroll={false}
                  replace
                  role="tab"
                  aria-selected={view === v}
                  className={cn(
                    "rounded-full px-3.5 py-1 capitalize transition-colors",
                    view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {v}
                </Link>
              ))}
            </div>
          </div>

          {view === "map" ? (
            <PriceMap
              stores={mapStores}
              center={{ lat, lng }}
              you={isExact(where) ? { lat, lng } : null}
            />
          ) : (
            <>
              <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
                <Link href={catHref()} className={chipClass(!cat)} scroll={false} replace>
                  All
                </Link>
                {CATEGORIES.map((c) => (
                  <Link key={c} href={catHref(c)} className={cn(chipClass(cat === c), "pl-1.5 capitalize")} scroll={false} replace>
                    <CategoryIcon category={c} className="size-6" />
                    {c}
                  </Link>
                ))}
              </div>

              <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-start">
                {nearby.map((s) => {
                  const list = [...(prices.get(s.id) ?? [])].sort((a, b) =>
                    (itemName.get(a.itemId) ?? "").localeCompare(itemName.get(b.itemId) ?? ""),
                  );
                  return (
                    <li key={s.id} className="min-w-0 rounded-[1.5rem] border bg-card px-4 pt-4 pb-2">
                      <div className="mb-1 flex items-center gap-3">
                        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-hero text-hero-foreground">
                          <Store className="size-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <Link href={`/store/${s.id}`} className="block truncate text-lg leading-tight font-bold hover:underline">
                            {s.name}
                          </Link>
                          <p className="text-sm text-muted-foreground">{isExact(where) ? `${miles(s.distanceKm)} away in ${s.borough}` : s.borough}</p>
                        </div>
                      </div>
                      {list.length === 0 ? (
                        <p className="py-3 text-sm text-muted-foreground">
                          No {cat ?? ""} prices yet.{" "}
                          <Link href={`/report?store=${s.id}`} className="font-semibold text-foreground underline underline-offset-2">
                            Add one
                          </Link>
                        </p>
                      ) : (
                        <ShowMore className="divide-y">{list.map(row)}</ShowMore>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </div>
    </>
  );
}
