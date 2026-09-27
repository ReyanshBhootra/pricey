import { Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryIcon } from "@/components/category";
import { LiveRefresh } from "@/components/live-refresh";
import { PriceList } from "@/components/price-list";
import { PriceTrend } from "@/components/price-trend";
import { Sticker } from "@/components/sticker";
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
  const storeMap = new Map(stores.map((s) => [s.id, s]));
  const best = prices[0];
  const high = prices.at(-1)?.price;

  return (
    <>
      <LiveRefresh name="reports" field="itemId" value={id} />
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground capitalize">
        <CategoryIcon category={item.category} className="size-6" />
        {item.category}
      </p>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-[2.6rem] leading-[0.95]">{item.name}</h1>
        <TrackButton itemId={item.id} />
      </div>

      {best && (
        <section className="relative mb-5 flex items-center gap-4 overflow-hidden rounded-[1.75rem] bg-hero p-5 text-hero-foreground">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-hero-muted">Cheapest right now</p>
            <Link href={`/store/${best.storeId}`} className="block font-display text-2xl leading-tight hover:underline">
              {storeMap.get(best.storeId)?.name ?? best.storeId}
            </Link>
            {prices.length > 1 && high! > best.price && (
              <p className="mt-2 text-sm">
                Saves you <strong className="text-lime">{money(high! - best.price)}</strong> over the priciest of {prices.length} stores.
              </p>
            )}
          </div>
          <Sticker price={best.price} label="cheapest" size="lg" slap delay={200} />
        </section>
      )}

      <PriceTrend history={history} />

      <h2 className="mb-3 font-display text-2xl">Every store, cheapest first</h2>
      <PriceList prices={prices} stores={storeMap} />
      <Button asChild variant="outline" className="mt-4">
        <Link href={`/report?item=${item.id}`}>
          <Plus data-icon="inline-start" /> Saw a different price? Report it
        </Link>
      </Button>
    </>
  );
}
