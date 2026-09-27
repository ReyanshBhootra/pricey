import { BadgePercent, Globe, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryIcon } from "@/components/category";
import { LiveRefresh } from "@/components/live-refresh";
import { Price } from "@/components/price";
import { Button } from "@/components/ui/button";
import { getItems, getReportsForStore, getStore, liveDeals } from "@/lib/data";
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
  const events = liveDeals(reports.filter((r) => r.type === "event" && r.timestamp >= dayAgo));
  // Estimates aren't anyone's report, so they stay out of "Latest reports".
  const recent = reports.filter((r) => r.type === "price" && !r.userId.startsWith("estimate:")).slice(0, 8);
  // Prices read from the store's own website (npm run import:prices).
  const imported = reports.filter((r) => r.sourceUrl && r.userId.startsWith("import:"));
  const sites = [...new Set(imported.map((r) => domainOf(r.sourceUrl)).filter(Boolean))];
  const checked = imported.length ? Math.max(...imported.map((r) => r.timestamp)) : null;

  return (
    <>
      <LiveRefresh name="reports" field="storeId" value={id} />
      <section className="mb-5 rounded-[1.75rem] bg-hero p-5 text-hero-foreground">
        <p className="mb-1 text-sm text-hero-muted">{store.address ? `${store.address}, ${store.borough}` : store.borough}</p>
        <h1 className="mb-4 text-[2.4rem] leading-[0.95]">{store.name}</h1>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <Button asChild variant="lime">
            <Link href={`/report?store=${store.id}`}>
              <Plus data-icon="inline-start" /> Report a price here
            </Link>
          </Button>
          <p className="text-sm text-hero-muted">
            <strong className="font-display text-xl font-normal text-hero-foreground">{prices.length}</strong> prices tracked
          </p>
        </div>
      </section>

      {sites.length > 0 && (
        <p className="mb-4 flex items-start gap-2 rounded-2xl border bg-card px-3.5 py-2.5 text-xs text-muted-foreground">
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
        <p className="mb-4 rounded-2xl border-2 border-dashed px-3.5 py-2.5 text-xs text-muted-foreground">
          Prices marked <span className="font-medium text-foreground">est.</span> are Pricey&apos;s estimates for this chain until a shopper confirms them. Shop here?{" "}
          <Link href={`/report?store=${store.id}`} className="font-semibold text-foreground underline underline-offset-2">
            Report what you paid
          </Link>
          .
        </p>
      )}

      {events.length > 0 && (
        <div className="mb-5 rounded-[1.5rem] bg-tangerine p-1.5 text-tangerine-foreground">
          <p className="flex items-center gap-2 px-3 pt-2 pb-2.5 font-display text-xl">
            <BadgePercent className="size-6" /> Deals here today
          </p>
          <ul className="divide-y rounded-[1.1rem] bg-card text-sm text-card-foreground">
            {events.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 px-3.5 py-3">
                <span>
                  {e.note ?? item.get(e.itemId)?.name} <span className="text-muted-foreground">{timeAgo(e.timestamp)}</span>
                </span>
                <Price value={e.price} className="shrink-0 text-lg" />
              </li>
            ))}
          </ul>
        </div>
      )}

      {prices.length === 0 && <p className="rounded-[1.5rem] border-2 border-dashed p-6 text-center text-sm text-muted-foreground">No prices here yet. Be the first.</p>}

      <div className="flex flex-col gap-4">
        {CATEGORIES.map((c) => {
          const list = prices.filter((p) => item.get(p.itemId)?.category === c);
          if (!list.length) return null;
          return (
            <section key={c} className="rounded-[1.5rem] border bg-card px-4 pt-4 pb-2">
              <h2 className="mb-1 flex items-center gap-2.5 font-display text-xl capitalize">
                <CategoryIcon category={c} className="size-8" />
                {c}
              </h2>
              <ul className="divide-y">
                {list.map((p) => (
                  <li key={p.itemId}>
                    <Link href={`/item/${p.itemId}`} className="group flex items-center gap-3 py-2.5">
                      <span className="min-w-0 flex-1 truncate group-hover:underline">{item.get(p.itemId)?.name ?? p.itemId}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{p.estimated ? "estimate" : p.votes === 1 ? "1 report" : `${p.votes} agree`}</span>
                      <Price value={p.price} className="w-16 shrink-0 text-right text-lg" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {recent.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 font-display text-2xl">Latest reports</h2>
          <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
            {recent.map((r) => (
              <li key={r.id}>
                {r.userId.startsWith("import:") ? `${domainOf(r.sourceUrl) ?? "The store's site"} listed` : "Someone saw"}{" "}
                <span className="text-foreground">{item.get(r.itemId)?.name ?? r.itemId}</span> at <span className="text-foreground">{money(r.price)}</span>
                {r.note && r.type === "price" ? ` (${r.note.toLowerCase()})` : ""}, {timeAgo(r.timestamp)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
