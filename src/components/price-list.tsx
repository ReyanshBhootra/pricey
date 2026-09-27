import Link from "next/link";
import { Price } from "@/components/price";
import { ShowMore } from "@/components/show-more";
import { StillPrice } from "@/components/still-price";
import { Badge } from "@/components/ui/badge";
import { hoursAgo, money, timeAgo } from "@/lib/format";
import type { Store, TrustedPrice } from "@/lib/types";
import { cn } from "@/lib/utils";

// Trusted price per store for one item, cheapest first, as a race of bars: the shorter, the cheaper.
// Week-old prices ask "Still $X?".
export function PriceList({ prices, stores, highlight }: { prices: TrustedPrice[]; stores: Map<string, Store>; highlight?: string }) {
  if (prices.length === 0) {
    return <p className="rounded-[1.5rem] border-2 border-dashed p-6 text-center text-sm text-muted-foreground">No reports yet. Be the first.</p>;
  }
  const cheapest = prices[0].price;
  const priciest = prices.at(-1)!.price;
  const staleBefore = hoursAgo(7 * 24); // nobody has confirmed it in a week
  return (
    <ShowMore initial={8} className="flex flex-col gap-2">
      {prices.map((p, i) => {
        const s = stores.get(p.storeId);
        const lowest = p.price === cheapest && prices.length > 1;
        const highest = p.price === priciest && prices.length > 1 && !lowest;
        const more = p.price - cheapest;
        return (
          <li
            key={p.storeId}
            className={cn("rounded-[1.25rem] border bg-card px-4 py-3", p.storeId === highlight && "border-primary ring-2 ring-primary/30")}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/store/${p.storeId}`} className="block truncate font-bold hover:underline">
                  {s?.name ?? p.storeId}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {s?.borough}, updated {timeAgo(p.lastReportedAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {lowest && <Badge variant="lime">Cheapest</Badge>}
                {p.estimated && <Badge variant="outline">est.</Badge>}
                <Price value={p.price} className="text-2xl" />
              </div>
            </div>

            {prices.length > 1 && (
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div
                  className={cn("bar-grow h-full rounded-full", lowest ? "bg-lime" : highest ? "bg-hike/70" : "bg-foreground/25")}
                  style={{ width: `${Math.max(6, (p.price / priciest) * 100)}%`, "--i": i } as React.CSSProperties}
                />
              </div>
            )}

            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 text-xs text-muted-foreground">
              <span>{more > 0.004 ? `${money(more)} more than the cheapest` : prices.length > 1 ? "Lowest price in NYC" : ""}</span>
              {p.estimated ? (
                <StillPrice itemId={p.itemId} storeId={p.storeId} price={p.price} estimated />
              ) : p.lastReportedAt < staleBefore ? (
                <StillPrice itemId={p.itemId} storeId={p.storeId} price={p.price} />
              ) : (
                <span>{p.votes === p.totalReports ? `${p.votes} ${p.votes === 1 ? "report" : "agree"}` : `${p.votes} of ${p.totalReports} agree`}</span>
              )}
            </div>
          </li>
        );
      })}
    </ShowMore>
  );
}
