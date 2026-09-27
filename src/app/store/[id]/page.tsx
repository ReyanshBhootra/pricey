import { Globe, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LiveRefresh } from "@/components/live-refresh";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getItems, getReportsForStore, getStore } from "@/lib/data";
import { hoursAgo, money, timeAgo } from "@/lib/format";
import { domainOf } from "@/lib/real-prices";
import { CATEGORIES } from "@/lib/types";
import { trustedPricesByItem } from "@/lib/vouch";

export const dynamic = "force-dynamic";

export default async function StorePage({ params }: PageProps<"/store/[id]">) {
  const { id } = await params;
  const [store, items, reports] = await Promise.all([getStore(id), getItems(), getReportsForStore(id)]);
  if (!store) notFound();

  const item = new Map(items.map((i) => [i.id, i]));
  const prices = trustedPricesByItem(reports);
  const dayAgo = hoursAgo(24);
  const events = reports.filter((r) => r.type === "event" && r.timestamp >= dayAgo);
  // Estimates aren't anyone's report, so they stay out of "Latest reports".
  const recent = reports.filter((r) => r.type === "price" && !r.userId.startsWith("estimate:")).slice(0, 8);
  // Prices read from the store's own website (npm run import:prices).
  const imported = reports.filter((r) => r.sourceUrl && r.userId.startsWith("import:"));
  const sites = [...new Set(imported.map((r) => domainOf(r.sourceUrl)).filter(Boolean))];
  const checked = imported.length ? Math.max(...imported.map((r) => r.timestamp)) : null;

  return (
    <>
      <LiveRefresh name="reports" field="storeId" value={id} />
      <p className="text-xs tracking-wide text-muted-foreground uppercase">{store.borough}</p>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{store.name}</h1>
          {store.address && <p className="text-sm text-muted-foreground">{store.address}</p>}
        </div>
        <Button asChild size="sm">
          <Link href={`/report?store=${store.id}`}>
            <Plus /> Report a price here
          </Link>
        </Button>
      </div>

      {sites.length > 0 && (
        <p className="mb-4 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs text-muted-foreground">
          <Globe className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Starting prices from{" "}
            {sites.map((d, i) => (
              <span key={d}>
                {i > 0 && ", "}
                <a href={imported.find((r) => domainOf(r.sourceUrl) === d)!.sourceUrl} target="_blank" rel="noreferrer" className="text-foreground underline underline-offset-2">
                  {d}
                </a>
              </span>
            ))}
            , checked {new Date(checked!).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })}. Shoppers vote to correct them if the shelf says otherwise.
          </span>
        </p>
      )}

      {prices.some((p) => p.estimated) && (
        <p className="mb-4 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
          Prices marked <span className="font-medium text-foreground">est.</span> are Pricey&apos;s estimates for this chain until a shopper confirms them. Shop here?{" "}
          <Link href={`/report?store=${store.id}`} className="text-primary hover:underline">
            Report what you paid
          </Link>
          .
        </p>
      )}

      {events.length > 0 && (
        <div className="mb-5 space-y-2 rounded-xl border bg-brand-soft p-4 text-sm">
          {events.map((e) => (
            <p key={e.id} className="flex gap-2">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                {e.note ?? `${item.get(e.itemId)?.name} for ${money(e.price)}`} <span className="text-muted-foreground">{timeAgo(e.timestamp)}</span>
              </span>
            </p>
          ))}
        </div>
      )}

      {prices.length === 0 && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No prices here yet. Be the first.</p>}

      <div className="space-y-3">
        {CATEGORIES.map((c) => {
          const list = prices.filter((p) => item.get(p.itemId)?.category === c);
          if (!list.length) return null;
          return (
            <Card key={c} className="gap-0 px-4 py-3">
              <h2 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{c}</h2>
              <ul className="divide-y text-sm">
                {list.map((p) => (
                  <li key={p.itemId}>
                    <Link href={`/item/${p.itemId}`} className="flex justify-between gap-3 py-2 hover:text-primary">
                      <span className="truncate">{item.get(p.itemId)?.name ?? p.itemId}</span>
                      <span className="shrink-0 tabular-nums">
                        <strong>{money(p.price)}</strong>
                        <span className="ml-1 text-xs text-muted-foreground">{p.estimated ? "est." : `×${p.votes}`}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>

      {recent.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 font-semibold">Latest reports</h2>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {recent.map((r) => (
              <li key={r.id}>
                {r.userId.startsWith("import:") ? `${domainOf(r.sourceUrl) ?? "The store's site"} listed` : "Someone saw"}{" "}
                <span className="text-foreground">{item.get(r.itemId)?.name ?? r.itemId}</span> at <span className="text-foreground">{money(r.price)}</span>
                {r.note && r.type === "price" ? ` (${r.note.toLowerCase()})` : ""} · {timeAgo(r.timestamp)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
