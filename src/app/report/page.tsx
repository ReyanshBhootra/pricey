import { PriceList } from "@/components/price-list";
import { ReportForm } from "@/components/report-form";
import { getItems, getPricesForItem, getStores } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ReportPage({ searchParams }: PageProps<"/report">) {
  const sp = await searchParams;
  const itemId = typeof sp.item === "string" ? sp.item : "";
  const storeId = typeof sp.store === "string" ? sp.store : "";
  const [items, stores] = await Promise.all([getItems(), getStores()]);
  const sortedStores = [...stores].sort((a, b) => a.borough.localeCompare(b.borough) || a.name.localeCompare(b.name));
  const prices = itemId ? await getPricesForItem(itemId) : [];
  const item = items.find((i) => i.id === itemId);

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Report a price</h1>
      <p className="mb-4 text-sm text-muted">What did you pay? Every report counts as a vote.</p>
      <ReportForm items={items} stores={sortedStores} itemId={itemId} storeId={storeId} />
      {item && (
        <section className="mt-6">
          <h2 className="mb-2 font-semibold">{item.name} across NYC</h2>
          <PriceList prices={prices} stores={new Map(stores.map((s) => [s.id, s]))} highlight={storeId} />
        </section>
      )}
    </>
  );
}
