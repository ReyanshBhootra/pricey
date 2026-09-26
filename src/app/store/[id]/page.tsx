import { Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LiveRefresh } from "@/components/live-refresh";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getItems, getReportsForStore, getStore } from "@/lib/data";
import { hoursAgo, money, timeAgo } from "@/lib/format";
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
  const recent = reports.filter((r) => r.type === "price").slice(0, 8);

  return (
    <>
      <LiveRefresh name="reports" field="storeId" value={id} />
      <p className="text-xs tracking-wide text-muted-foreground uppercase">{store.borough}</p>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{store.name}</h1>
        <Button asChild size="sm">
          <Link href={`/report?store=${store.id}`}>
            <Plus /> Report a price here
          </Link>
        </Button>
      </div>

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
                        <span className="ml-1 text-xs text-muted-foreground">×{p.votes}</span>
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
                Someone saw <span className="text-foreground">{item.get(r.itemId)?.name ?? r.itemId}</span> at{" "}
                <span className="text-foreground">{money(r.price)}</span> · {timeAgo(r.timestamp)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
