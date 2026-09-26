import { LiveRefresh } from "@/components/live-refresh";
import { PriceList } from "@/components/price-list";
import { ReportForm } from "@/components/report-form";
import { getItems, getPricesForItem, getStores } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ReportPage({ searchParams }: PageProps<"/report">) {
  const sp = await searchParams;
  const itemId = typeof sp.item === "string" ? sp.item : "";
  const storeId = typeof sp.store === "string" ? sp.store : "";
  const newItem = typeof sp.newItem === "string" ? sp.newItem.slice(0, 80) : undefined;
  const [items, stores] = await Promise.all([getItems(), getStores()]);
  const sortedStores = [...stores].sort((a, b) => a.name.localeCompare(b.name));
  const sortedItems = [...items].sort((a, b) => a.name.localeCompare(b.name));
  const item = items.find((i) => i.id === itemId);
  const prices = item ? await getPricesForItem(item.id) : [];

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Report a price</h1>
      <p className="mb-4 text-sm text-muted-foreground">What did you pay? Every person gets one vote per item and store.</p>
      <ReportForm items={sortedItems} stores={sortedStores} itemId={item ? itemId : ""} storeId={storeId} newItemName={newItem} />
      {item && (
        <section className="mt-6">
          <LiveRefresh name="reports" field="itemId" value={item.id} />
          <h2 className="mb-2 font-semibold">{item.name} across NYC</h2>
          <PriceList prices={prices} stores={new Map(stores.map((s) => [s.id, s]))} highlight={storeId} />
        </section>
      )}
    </>
  );
}
