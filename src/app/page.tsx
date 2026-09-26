import Link from "next/link";
import { Suspense } from "react";
import { LocationPicker } from "@/components/location-picker";
import { TrackedAlerts } from "@/components/tracked-alerts";
import { getActiveEvents, getItems, getNearbyStores, getPriceChanges, getPricesForStores, getStores } from "@/lib/data";
import { DEFAULT_LOCATION, money, timeAgo } from "@/lib/format";
import { CATEGORIES, type Category } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Nearby({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const lat = Number(str("lat") ?? DEFAULT_LOCATION.lat);
  const lng = Number(str("lng") ?? DEFAULT_LOCATION.lng);
  const loc = str("loc") ?? "Manhattan";
  const cat = CATEGORIES.includes(str("cat") as Category) ? (str("cat") as Category) : undefined;

  // Stores within 3 km, or the 5 closest if that is too few.
  let nearby = await getNearbyStores(lat, lng, 3);
  if (nearby.length < 3) nearby = (await getNearbyStores(lat, lng, 100)).slice(0, 5);

  const [items, stores, prices, events, changes] = await Promise.all([
    getItems(),
    getStores(),
    getPricesForStores(nearby.map((s) => s.id), cat),
    getActiveEvents({ hours: 24, lat, lng, radiusKm: 5 }),
    getPriceChanges({ hours: 48 }),
  ]);
  // With a category filter on, skip stores with nothing in it (unless that leaves nothing).
  if (cat && nearby.some((s) => prices.get(s.id)?.length)) nearby = nearby.filter((s) => prices.get(s.id)?.length);
  const itemName = new Map(items.map((i) => [i.id, i.name]));
  const storeName = new Map(stores.map((s) => [s.id, s.name]));
  const eventSpots = new Set(events.map((e) => e.storeId)).size;

  const catHref = (c?: Category) => {
    const q = new URLSearchParams({ lat: String(lat), lng: String(lng), loc });
    if (c) q.set("cat", c);
    return `/?${q}`;
  };

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Real prices near you</h1>
      <p className="mb-4 text-sm text-muted">Reported by New Yorkers. The price most people agree on wins.</p>

      <Suspense>
        <LocationPicker label={loc} />
      </Suspense>

      <TrackedAlerts
        changes={changes.map((c) => ({ ...c, itemName: itemName.get(c.itemId) ?? c.itemId, storeName: storeName.get(c.storeId) ?? c.storeId }))}
      />

      {events.length > 0 && (
        <details className="mb-5 rounded-xl border border-line bg-accent-soft p-4">
          <summary className="cursor-pointer font-semibold">
            {eventSpots} {eventSpots === 1 ? "spot" : "spots"} near you {eventSpots === 1 ? "has" : "have"} deals right now
          </summary>
          <ul className="mt-3 space-y-2 text-sm">
            {events.map((e) => (
              <li key={e.id}>
                <strong>{storeName.get(e.storeId) ?? e.storeId}</strong>: {e.note ?? `${itemName.get(e.itemId)} for ${money(e.price)}`}{" "}
                <span className="text-muted">{timeAgo(e.timestamp)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 text-sm">
        <Link href={catHref()} className={chip(!cat)}>All</Link>
        {CATEGORIES.map((c) => (
          <Link key={c} href={catHref(c)} className={chip(cat === c)}>
            {c}
          </Link>
        ))}
      </div>

      <ul className="space-y-3">
        {nearby.map((s) => {
          const list = (prices.get(s.id) ?? []).sort((a, b) => (itemName.get(a.itemId) ?? "").localeCompare(itemName.get(b.itemId) ?? ""));
          const row = (p: (typeof list)[number]) => (
            <li key={p.itemId} className="flex justify-between gap-3 py-1.5">
              <Link href={`/item/${p.itemId}`} className="truncate hover:underline">
                {itemName.get(p.itemId) ?? p.itemId}
              </Link>
              <span className="shrink-0 tabular-nums">
                <strong>{money(p.price)}</strong>
                <span className="ml-1 text-xs text-muted">×{p.votes}</span>
              </span>
            </li>
          );
          return (
            <li key={s.id} className="rounded-xl border border-line bg-card p-4">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h2 className="truncate font-semibold">{s.name}</h2>
                <span className="shrink-0 text-xs text-muted">
                  {s.distanceKm < 1 ? `${Math.round(s.distanceKm * 1000)} m` : `${s.distanceKm.toFixed(1)} km`} · {s.borough}
                </span>
              </div>
              {list.length === 0 ? (
                <p className="text-sm text-muted">
                  No {cat ?? ""} prices yet.{" "}
                  <Link href={`/report?store=${s.id}`} className="text-accent hover:underline">Add one</Link>
                </p>
              ) : (
                <>
                  <ul className="divide-y divide-line text-sm">{list.slice(0, 5).map(row)}</ul>
                  {list.length > 5 && (
                    <details className="text-sm">
                      <summary className="cursor-pointer pt-1 text-accent">{list.length - 5} more</summary>
                      <ul className="divide-y divide-line">{list.slice(5).map(row)}</ul>
                    </details>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function chip(active: boolean) {
  return `shrink-0 rounded-full border px-3 py-1 capitalize ${active ? "border-foreground bg-foreground text-background" : "border-line bg-card"}`;
}
