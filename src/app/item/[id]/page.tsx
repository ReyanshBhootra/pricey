import Link from "next/link";
import { notFound } from "next/navigation";
import { PriceList } from "@/components/price-list";
import { TrackButton } from "@/components/track-button";
import { getItems, getPricesForItem, getStores } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ItemPage({ params }: PageProps<"/item/[id]">) {
  const { id } = await params;
  const [items, stores, prices] = await Promise.all([getItems(), getStores(), getPricesForItem(id)]);
  const item = items.find((i) => i.id === id);
  if (!item) notFound();

  return (
    <>
      <p className="text-xs tracking-wide text-muted uppercase">{item.category}</p>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{item.name}</h1>
        <TrackButton itemId={item.id} />
      </div>
      <PriceList prices={prices} stores={new Map(stores.map((s) => [s.id, s]))} />
      <Link href={`/report?item=${item.id}`} className="mt-4 inline-block text-sm text-accent hover:underline">
        Saw a different price? Report it
      </Link>
    </>
  );
}
