import { Bus, Check, Footprints, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CategoryIcon } from "@/components/category";
import { chipClass } from "@/components/chip";
import { LocationPicker } from "@/components/location-picker";
import { Price } from "@/components/price";
import { Sticker } from "@/components/sticker";
import { getItems } from "@/lib/data";
import { money } from "@/lib/format";
import { matchItems, type Located } from "@/lib/grounding";
import { optimizeList, type Stop } from "@/lib/optimizer";
import { cn } from "@/lib/utils";
import { getWhere, isExact } from "@/lib/where";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Shopping list" };

// One store on the trip. Works on the dark hero card and on light ones: text inherits its color.
function StopCard({ stop, step }: { stop: Stop; step?: number }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <Link href={`/store/${stop.store.id}`} className="flex items-center gap-2 text-lg font-bold hover:underline">
          {step && <span className="grid size-7 place-items-center rounded-full bg-lime font-display text-sm text-lime-foreground">{step}</span>}
          {stop.store.name}
        </Link>
        {stop.miles !== null && (
          <span className="flex items-center gap-1.5 text-xs opacity-75">
            {stop.fare ? <Bus className="size-3.5" /> : <Footprints className="size-3.5" />}
            {stop.distance}, {stop.fare ? `${money(stop.fare)} round trip by subway or bus` : `${stop.walkMin} min walk`}
          </span>
        )}
      </div>
      <ul className="divide-y rounded-2xl bg-card text-sm text-card-foreground">
        {stop.items.map(({ item, price, estimated }) => (
          <li key={item.id} className="flex items-center gap-3 px-3 py-2">
            <CategoryIcon category={item.category} className="size-6" />
            <Link href={`/item/${item.id}`} className="min-w-0 flex-1 truncate hover:underline">
              {item.name}
            </Link>
            {estimated && <span className="text-xs text-muted-foreground">estimate</span>}
            <Price value={price} className="text-base" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h2 className="mb-3 flex items-center gap-2.5 text-lg font-bold">
      <span className="grid size-8 place-items-center rounded-full bg-primary font-display text-base text-primary-foreground">{n}</span>
      {children}
    </h2>
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
    // Laptop and up: build the list on the left, the cheapest trip stays in view on the right.
    <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-10">
      <div className="min-w-0">
          <h1 className="mb-2 text-[2.6rem] leading-[0.95] lg:text-[3.5rem]">Shopping list</h1>
          <p className="mb-6 text-muted-foreground">
            The cheapest sensible trip. Walking is free, the subway is {money(2.9)} each way, and we only suggest a second store when it&apos;s close by and really saves you money.
          </p>

          <Step n={1}>Where are you starting from?</Step>
          <Suspense>
            <LocationPicker where={saved && { label: saved.label, kind: saved.kind }} />
          </Suspense>

          <div className="flex items-baseline justify-between gap-2">
            <Step n={2}>What do you need?</Step>
            {chosen.length > 0 && (
              <Link href="/list" replace scroll={false} className="text-sm font-semibold text-muted-foreground underline underline-offset-2 hover:text-foreground">
                Clear list
              </Link>
            )}
          </div>
          <div className="mb-6 flex flex-wrap gap-2 lg:mb-0">
            {items.map((i) => (
              <Link key={i.id} href={href(i.id)} replace scroll={false} className={cn(chipClass(chosenIds.has(i.id)), "pl-1.5")} aria-pressed={chosenIds.has(i.id)}>
                {chosenIds.has(i.id) ? (
                  <span className="grid size-6 place-items-center rounded-full bg-lime text-lime-foreground">
                    <Check className="size-3.5" strokeWidth={3} />
                  </span>
                ) : (
                  <CategoryIcon category={i.category} className="size-6" />
                )}
                {i.name}
              </Link>
            ))}
          </div>
      </div>

      <div className="min-w-0 lg:sticky lg:top-20">
          {!result && <p className="rounded-[1.5rem] border-2 border-dashed p-6 text-center text-sm text-muted-foreground">Tap the items you need and your cheapest trip shows up here.</p>}

          {result && (
            <div className="flex flex-col gap-4">
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="size-4" />
                {whereText ? `Measured from ${whereText}.` : "No location yet, so this is across NYC. Pick one to count walking and fares."}
              </p>

              {!result.best && <p className="rounded-[1.5rem] border-2 border-dashed p-6 text-center text-sm text-muted-foreground">Nobody has reported these near you yet.</p>}
              {result.best && (
                <section className="flex flex-col gap-3 rounded-[1.75rem] bg-hero p-5 text-hero-foreground">
                  <div className="flex items-end justify-between gap-2">
                    <h2 className="font-display text-2xl">Best single stop</h2>
                    <Price value={result.best.total} className="text-4xl text-lime" />
                  </div>
                  <StopCard stop={result.best.stops[0]} />
                  {result.best.stops[0].fare > 0 && <p className="text-xs text-hero-muted">Total includes the subway fare. Groceries alone: {money(result.best.groceries)}.</p>}
                  {result.best.missing.length > 0 && <p className="text-xs text-hero-muted">Not reported here: {result.best.missing.map((m) => m.name).join(", ")}.</p>}
                </section>
              )}

              {result.split && (
                <section className="relative flex flex-col gap-3 rounded-[1.75rem] bg-brand-soft p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="font-display text-2xl">Worth a second stop</h2>
                      <Price value={result.split.total} className="text-3xl" />
                    </div>
                    {result.split.saves > 0 && <Sticker price={result.split.saves} label="saved" size="md" slap delay={300} tilt={8} />}
                  </div>
                  <p className="text-sm">
                    {result.split.saves > 0 ? `Saves ${money(result.split.saves)}` : "Gets more of your list"}. The two stores are close together, so it&apos;s one trip.
                  </p>
                  {result.split.stops.map((s, i) => (
                    <StopCard key={s.store.id} stop={s} step={i + 1} />
                  ))}
                </section>
              )}

              {result.best && !result.split && (
                <p className="text-sm text-muted-foreground">Splitting across stores isn&apos;t worth it here: the savings are small or the stores are too far apart.</p>
              )}

            </div>
          )}
      </div>
    </div>
  );
}
