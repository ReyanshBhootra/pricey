import { Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LiveRefresh } from "@/components/live-refresh";
import { PriceList } from "@/components/price-list";
import { PriceTrend } from "@/components/price-trend";
import { TrackButton } from "@/components/track-button";
import { Button } from "@/components/ui/button";
import { getItem, getPricesForItem, getStores } from "@/lib/data";
import { money } from "@/lib/format";
import { priceHistory } from "@/lib/history";

export const dynamic = "force-dynamic";

export default async function ItemPage({ params }: PageProps<"/item/[id]">) {
  const { id } = await params;
  const [item, stores, prices, history] = await Promise.all([getItem(id), getStores(), getPricesForItem(id), priceHistory(id)]);
  if (!item) notFound();
  const low = prices[0]?.price;
  const high = prices.at(-1)?.price;

  return (
    <>
      <LiveRefresh name="reports" field="itemId" value={id} />
      <p className="text-xs tracking-wide text-muted-foreground uppercase">{item.category}</p>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{item.name}</h1>
        <TrackButton itemId={item.id} />
      </div>
      {prices.length > 1 && (
        <p className="mb-4 text-sm text-muted-foreground">
          {money(low!)} to {money(high!)} across {prices.length} stores. Save {money(high! - low!)} by shopping at the cheapest.
        </p>
      )}
      <PriceTrend history={history} />
      <div className="mt-3">
        <PriceList prices={prices} stores={new Map(stores.map((s) => [s.id, s]))} />
      </div>
      <Button asChild variant="outline" className="mt-4">
        <Link href={`/report?item=${item.id}`}>
          <Plus /> Saw a different price? Report it
        </Link>
      </Button>
    </>
  );
}
