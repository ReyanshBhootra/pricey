import { ChevronRight, ListChecks, Sparkles } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { chipClass } from "@/components/chip";
import { ItemSearch } from "@/components/item-search";
import { LiveRefresh } from "@/components/live-refresh";
import { LocationPicker } from "@/components/location-picker";
import { PriceMap } from "@/components/price-map";
import { getMapStores } from "@/lib/map-data";
import { ShowMore } from "@/components/show-more";
import { TrackedAlerts } from "@/components/tracked-alerts";
import { Card } from "@/components/ui/card";
import {
  getActiveEvents,
  getItems,
  getNearbyStores,
  getPriceChanges,
  getPricesForStores,
  getStores,
} from "@/lib/data";
import { miles, money, timeAgo } from "@/lib/format";
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

  const row = (p: TrustedPrice) => (
    <li key={p.itemId}>
      <Link
        href={`/item/${p.itemId}`}
        className="flex justify-between gap-3 py-2 hover:text-primary"
      >
        <span className="truncate">{itemName.get(p.itemId) ?? p.itemId}</span>
        <span className="shrink-0 tabular-nums">
          <strong>{money(p.price)}</strong>
          <span className="ml-1 text-xs text-muted-foreground">×{p.votes}</span>
        </span>
      </Link>
    </li>
  );

  return (
    <>
      <LiveRefresh name="reports" />
      <div className="mb-1 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">
          Real prices {nearText(where)}
        </h1>
        <div
          className="flex shrink-0 rounded-full border bg-card p-0.5 text-sm"
          role="tablist"
          aria-label="View"
        >
          {(["list", "map"] as const).map((v) => (
            <Link
              key={v}
              href={viewHref(v)}
              scroll={false}
              replace
              role="tab"
              aria-selected={view === v}
              className={`rounded-full px-3 py-1 capitalize ${view === v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
            >
              {v}
            </Link>
          ))}
        </div>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Reported by New Yorkers. The price most people agree on wins.
      </p>

      <ItemSearch items={items} />
      <Suspense>
        <LocationPicker where={saved && { label: saved.label, kind: saved.kind }} />
      </Suspense>
      <Link
        href="/list"
        className="mb-4 flex items-center gap-2 rounded-xl border bg-card px-4 py-3 text-sm shadow-xs hover:bg-accent"
      >
        <ListChecks className="size-4 text-primary" />
        <span>
          <span className="font-medium">Plan a shopping list</span>
          <span className="text-muted-foreground"> · cheapest trip, fares counted</span>
        </span>
        <ChevronRight className="ml-auto size-4 text-muted-foreground" />
      </Link>

      <TrackedAlerts
        changes={changes.map((c) => ({
          ...c,
          itemName: itemName.get(c.itemId) ?? c.itemId,
          storeName: storeName.get(c.storeId) ?? c.storeId,
        }))}
      />

      {events.length > 0 && (
        <details className="group mb-5 rounded-xl border bg-brand-soft p-4">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold">
            <Sparkles className="size-4 text-primary" />
            {eventSpots} {eventSpots === 1 ? "spot" : "spots"} {nearText(where)}{" "}
            {eventSpots === 1 ? "has" : "have"} deals right now
            <ChevronRight className="ml-auto size-4 transition-transform group-open:rotate-90" />
          </summary>
          <ul className="mt-3 space-y-2 text-sm">
            {events.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/store/${e.storeId}`}
                  className="font-medium hover:underline"
                >
                  {storeName.get(e.storeId) ?? e.storeId}
                </Link>
                : {e.note ?? `${itemName.get(e.itemId)} for ${money(e.price)}`}{" "}
                <span className="text-muted-foreground">
                  {timeAgo(e.timestamp)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {view === "map" ? (
        <PriceMap
          stores={mapStores}
          center={{ lat, lng }}
          you={isExact(where) ? { lat, lng } : null}
        />
      ) : (
        <>
          <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
            <Link href={catHref()} className={chipClass(!cat)} scroll={false} replace>
              All
            </Link>
            {CATEGORIES.map((c) => (
              <Link
                key={c}
                href={catHref(c)}
                className={chipClass(cat === c)}
                scroll={false}
                replace
              >
                {c}
              </Link>
            ))}
          </div>

          <ul className="space-y-3">
            {nearby.map((s) => {
              const list = [...(prices.get(s.id) ?? [])].sort((a, b) =>
                (itemName.get(a.itemId) ?? "").localeCompare(
                  itemName.get(b.itemId) ?? "",
                ),
              );
              return (
                <li key={s.id}>
                  <Card className="gap-0 px-4 py-3">
                    <div className="mb-1 flex items-baseline justify-between gap-3">
                      <Link
                        href={`/store/${s.id}`}
                        className="truncate font-semibold hover:underline"
                      >
                        {s.name}
                      </Link>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {isExact(where) ? `${miles(s.distanceKm)} · ${s.borough}` : s.borough}
                      </span>
                    </div>
                    {list.length === 0 ? (
                      <p className="py-2 text-sm text-muted-foreground">
                        No {cat ?? ""} prices yet.{" "}
                        <Link
                          href={`/report?store=${s.id}`}
                          className="text-primary hover:underline"
                        >
                          Add one
                        </Link>
                      </p>
                    ) : (
                      <ShowMore className="divide-y text-sm">
                        {list.map(row)}
                      </ShowMore>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
