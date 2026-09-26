import Link from "next/link";
import { money, timeAgo } from "@/lib/format";
import type { Store, TrustedPrice } from "@/lib/types";

// Trusted price per store for one item, cheapest first.
export function PriceList({ prices, stores, highlight }: { prices: TrustedPrice[]; stores: Map<string, Store>; highlight?: string }) {
  if (prices.length === 0) return <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">No reports yet. Be the first.</p>;
  const cheapest = prices[0].price;
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
      {prices.map((p) => {
        const s = stores.get(p.storeId);
        return (
          <li key={p.storeId} className={`flex items-center justify-between gap-4 p-3 ${p.storeId === highlight ? "bg-accent-soft" : ""}`}>
            <div className="min-w-0">
              <Link href={`/report?item=${p.itemId}&store=${p.storeId}`} className="block truncate font-medium hover:underline">
                {s?.name ?? p.storeId}
              </Link>
              <span className="text-xs text-muted">
                {s?.borough} · updated {timeAgo(p.lastReportedAt)}
              </span>
            </div>
            <div className="shrink-0 text-right">
              <div className="font-semibold tabular-nums">
                {money(p.price)}
                {p.price === cheapest && <span className="ml-2 rounded bg-accent-soft px-1.5 py-0.5 text-xs text-accent">lowest</span>}
              </div>
              <div className="text-xs text-muted">
                {p.votes} of {p.totalReports} agree
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
