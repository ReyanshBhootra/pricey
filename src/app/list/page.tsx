import { Bus, Check, Footprints, ListChecks, MapPin, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { chipClass } from "@/components/chip";
import { LocationPicker } from "@/components/location-picker";
import { Card } from "@/components/ui/card";
import { getItems } from "@/lib/data";
import { money } from "@/lib/format";
import { matchItems, type Located } from "@/lib/grounding";
import { optimizeList, type Stop } from "@/lib/optimizer";
import { cn } from "@/lib/utils";
import { getWhere, isExact } from "@/lib/where";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Shopping list" };

function StopCard({ stop, step }: { stop: Stop; step?: number }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Link href={`/store/${stop.store.id}`} className="font-semibold hover:underline">
          {step ? `${step}. ` : ""}
          {stop.store.name}
        </Link>
        {stop.miles !== null && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {stop.fare ? <Bus className="size-3.5" /> : <Footprints className="size-3.5" />}
            {stop.distance} · {stop.fare ? `${money(stop.fare)} round trip by subway or bus` : `${stop.walkMin} min walk`}
          </span>
        )}
      </div>
      <ul className="divide-y rounded-lg border text-sm">
        {stop.items.map(({ item, price, estimated }) => (
          <li key={item.id} className="flex justify-between gap-3 px-3 py-2">
            <Link href={`/item/${item.id}`} className="truncate hover:underline">
              {item.name}
            </Link>
            <span className="tabular-nums">
              {estimated && <span className="mr-1.5 text-xs text-muted-foreground">est.</span>}
              {money(price)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function ListPage({ searchParams }: PageProps<"/list">) {
  const sp = await searchParams;
  const saved = await getWhere();
  // The planner needs real distances; a borough alone means "anywhere in the borough".
  const where: Located | null = saved && { lat: saved.lat, lng: saved.lng, label: saved.label, approximate: !isExact(saved) };
  const items = await getItems();
  const ids = (typeof sp.items === "string" ? sp.items : "").split(",").map((s) => s.trim()).filter(Boolean);
  const result = ids.length ? await optimizeList(ids, where, (n, all) => all.find((i) => i.id === n) ?? matchItems(n, all)[0] ?? null) : null;
  const chosen = result?.items ?? [];
  const chosenIds = new Set(chosen.map((i) => i.id));

  // Tapping an item adds or removes it. `replace` keeps Back from stepping through every tap.
  const href = (id: string) => {
    const next = chosenIds.has(id) ? chosen.filter((i) => i.id !== id).map((i) => i.id) : [...chosen.map((i) => i.id), id];
    return next.length ? `/list?items=${next.join(",")}` : "/list";
  };
  const whereText = !saved ? null : saved.kind === "gps" ? "your location" : saved.kind === "place" ? `near ${saved.label}` : `${saved.label} (borough only, so no walking times)`;

  return (
    <>
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold tracking-tight">
        <ListChecks className="size-6 text-primary" /> Shopping list
      </h1>
      <p className="mb-4 text-sm text-muted-foreground">
        The cheapest sensible trip. Walking is free, the subway is {money(2.9)} each way, and we only suggest a second store when it&apos;s close by and really saves you money.
      </p>

      <h2 className="mb-2 text-sm font-semibold">1. Where are you starting from?</h2>
      <Suspense>
        <LocationPicker where={saved && { label: saved.label, kind: saved.kind }} />
      </Suspense>

      <h2 className="mb-2 flex items-baseline justify-between gap-2 text-sm font-semibold">
        2. What do you need?
        {chosen.length > 0 && (
          <Link href="/list" replace scroll={false} className="text-xs font-normal text-muted-foreground hover:text-foreground">
            Clear list
          </Link>
        )}
      </h2>
      <div className="mb-6 flex flex-wrap gap-2">
        {items.map((i) => (
          <Link key={i.id} href={href(i.id)} replace scroll={false} className={cn(chipClass(chosenIds.has(i.id)), "normal-case")} aria-pressed={chosenIds.has(i.id)}>
            {chosenIds.has(i.id) ? <Check className="mr-1 size-3.5" /> : <Plus className="mr-1 size-3.5 text-muted-foreground" />}
            {i.name}
          </Link>
        ))}
      </div>

      {!result && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Tap the items you need and your cheapest trip shows up here.</p>}

      {result && (
        <div className="space-y-4">
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-4" />
            {whereText ? `Measured from ${whereText}.` : "No location yet, so this is across NYC. Pick one above to count walking and fares."}
          </p>

          {!result.best && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nobody has reported these near you yet.</p>}
          {result.best && (
            <Card className="gap-3 p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-semibold">Best single stop</h2>
                <span className="text-lg font-bold tabular-nums">{money(result.best.total)}</span>
              </div>
              <StopCard stop={result.best.stops[0]} />
              {result.best.stops[0].fare > 0 && <p className="text-xs text-muted-foreground">Total includes the subway fare. Groceries alone: {money(result.best.groceries)}.</p>}
              {result.best.missing.length > 0 && <p className="text-xs text-muted-foreground">Not reported here: {result.best.missing.map((m) => m.name).join(", ")}.</p>}
            </Card>
          )}

          {result.split && (
            <Card className="gap-3 border-primary/40 bg-brand-soft p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-semibold">Worth a second stop</h2>
                <span className="text-lg font-bold tabular-nums">{money(result.split.total)}</span>
              </div>
              <p className="text-sm">
                {result.split.saves > 0 ? `Saves ${money(result.split.saves)}` : "Gets more of your list"}. The two stores are close together, so it&apos;s one trip.
              </p>
              {result.split.stops.map((s, i) => (
                <StopCard key={s.store.id} stop={s} step={i + 1} />
              ))}
            </Card>
          )}

          {result.best && !result.split && (
            <p className="text-sm text-muted-foreground">Splitting across stores isn&apos;t worth it here: the savings are small or the stores are too far apart.</p>
          )}

        </div>
      )}
    </>
  );
}
