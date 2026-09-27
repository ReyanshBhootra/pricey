import { Bus, Footprints, ListChecks, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { chipClass } from "@/components/chip";
import { LocateButton } from "@/components/locate-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getItems, getUser } from "@/lib/data";
import { inNyc, money } from "@/lib/format";
import { matchItems, type Located } from "@/lib/grounding";
import { optimizeList, type Stop } from "@/lib/optimizer";
import { BOROUGH_PLACES, findPlace } from "@/lib/places";
import { sessionUserId } from "@/lib/session";
import { findBorough } from "@/lib/texting";
import { BOROUGHS, type Borough } from "@/lib/types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Shopping list" };

// Where to measure from: a place they typed, their location, the borough they picked on
// Nearby, or the home saved on their account.
async function locate(sp: Record<string, string | undefined>): Promise<Located | null> {
  if (sp.near) {
    const p = findPlace(sp.near);
    if (p) return { lat: p.lat, lng: p.lng, label: p.label };
    const b = findBorough(sp.near);
    if (b) return { ...BOROUGH_PLACES[b], approximate: true };
  }
  const lat = Number(sp.lat);
  const lng = Number(sp.lng);
  if (sp.lat && sp.lng && inNyc(lat, lng)) {
    if (sp.loc && (BOROUGHS as readonly string[]).includes(sp.loc)) return { ...BOROUGH_PLACES[sp.loc as Borough], approximate: true };
    return { lat, lng, label: "you" };
  }
  const id = await sessionUserId();
  const home = id ? (await getUser(id))?.home : undefined;
  return home ? { lat: home.lat, lng: home.lng, label: home.label, approximate: home.approximate } : null;
}

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
        {stop.items.map(({ item, price }) => (
          <li key={item.id} className="flex justify-between gap-3 px-3 py-2">
            <Link href={`/item/${item.id}`} className="truncate hover:underline">
              {item.name}
            </Link>
            <span className="tabular-nums">{money(price)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function ListPage({ searchParams }: PageProps<"/list">) {
  const raw = await searchParams;
  const sp = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === "string" ? v : undefined]));
  const [items, where] = await Promise.all([getItems(), locate(sp)]);
  const names = (sp.items ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const result = names.length ? await optimizeList(names, where, (n, all) => all.find((i) => i.id === n) ?? matchItems(n, all)[0] ?? null) : null;
  const chosen = new Set(result?.items.map((i) => i.id) ?? []);

  // Chips add or remove an item, keeping everything else in the URL.
  const href = (id: string) => {
    const next = chosen.has(id) ? [...chosen].filter((x) => x !== id) : [...chosen, id];
    const q = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => !!e[1]));
    if (next.length) q.set("items", [...next, ...(result?.unknown ?? [])].join(","));
    else q.delete("items");
    return `/list?${q}`;
  };
  const hidden = Object.entries(sp).filter(([k, v]) => v && !["items", "near"].includes(k));
  const whereText = where ? (where.approximate ? `${where.label} (borough only, so no walking times)` : where.label === "you" ? "your location" : `near ${where.label}`) : null;

  return (
    <>
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold tracking-tight">
        <ListChecks className="size-6 text-primary" /> Shopping list
      </h1>
      <p className="mb-4 text-sm text-muted-foreground">
        The cheapest sensible trip. Walking is free, the subway is {money(2.9)} each way, and we only suggest a second store when it&apos;s close by and really saves you money.
      </p>

      <form action="/list" className="mb-4 space-y-2">
        {hidden.map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <Input name="items" defaultValue={result ? [...result.items.map((i) => i.name), ...result.unknown].join(", ") : ""} placeholder="eggs, milk, bread, bananas" aria-label="Your list, separated by commas" />
        <div className="flex flex-wrap gap-2">
          <Input name="near" defaultValue={sp.near ?? ""} placeholder={whereText ? `From ${whereText}` : "ZIP or neighborhood"} aria-label="ZIP or neighborhood" className="max-w-56 flex-1" />
          <Button type="submit">Plan my trip</Button>
          <Suspense>
            <LocateButton />
          </Suspense>
        </div>
      </form>

      <div className="mb-6 flex flex-wrap gap-2">
        {items.map((i) => (
          <Link key={i.id} href={href(i.id)} scroll={false} className={cn(chipClass(chosen.has(i.id)), "normal-case")}>
            {i.name}
          </Link>
        ))}
      </div>

      {result && (
        <div className="space-y-4">
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-4" />
            {whereText ? `Measured from ${whereText}.` : "No location yet, so this is across NYC. Add a ZIP to count walking and fares."}
          </p>

          {!result.best && (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              {result.items.length ? "Nobody has reported these near you yet." : "Pick items from the list above."}
            </p>
          )}

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

          {result.unknown.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Not tracked yet: {result.unknown.join(", ")}.{" "}
              <Link href={`/report?newItem=${encodeURIComponent(result.unknown[0])}`} className="text-primary hover:underline">
                Add a price
              </Link>
            </p>
          )}
        </div>
      )}
    </>
  );
}
