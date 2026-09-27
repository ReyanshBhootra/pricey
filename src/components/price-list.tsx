import Link from "next/link";
import { StillPrice } from "@/components/still-price";
import { Badge } from "@/components/ui/badge";
import { money, timeAgo } from "@/lib/format";
import type { Store, TrustedPrice } from "@/lib/types";
import { cn } from "@/lib/utils";

const STALE_MS = 7 * 24 * 60 * 60_000;

// Trusted price per store for one item, cheapest first. Week-old prices ask "Still $X?".
export function PriceList({ prices, stores, highlight }: { prices: TrustedPrice[]; stores: Map<string, Store>; highlight?: string }) {
  if (prices.length === 0) {
    return <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No reports yet. Be the first.</p>;
  }
  const cheapest = prices[0].price;
  const now = Date.now();
  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
      {prices.map((p) => {
        const s = stores.get(p.storeId);
        return (
          <li key={p.storeId} className={cn("flex items-center justify-between gap-4 px-4 py-3", p.storeId === highlight && "bg-brand-soft")}>
            <div className="min-w-0">
              <Link href={`/store/${p.storeId}`} className="block truncate font-medium hover:underline">
                {s?.name ?? p.storeId}
              </Link>
              <span className="text-xs text-muted-foreground">
                {s?.borough} · updated {timeAgo(p.lastReportedAt)}
              </span>
            </div>
            <div className="shrink-0 text-right">
              <div className="flex items-center justify-end gap-2 font-semibold tabular-nums">
                {p.price === cheapest && prices.length > 1 && <Badge>lowest</Badge>}
                {money(p.price)}
              </div>
              {now - p.lastReportedAt > STALE_MS ? (
                <StillPrice itemId={p.itemId} storeId={p.storeId} price={p.price} />
              ) : (
              <div className="text-xs text-muted-foreground">
                {p.votes === p.totalReports ? `${p.votes} ${p.votes === 1 ? "report" : "agree"}` : `${p.votes} of ${p.totalReports} agree`}
              </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
