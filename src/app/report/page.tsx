import { Camera } from "lucide-react";
import Link from "next/link";
import { LiveRefresh } from "@/components/live-refresh";
import { PriceList } from "@/components/price-list";
import { ReportForm } from "@/components/report-form";
import { DealForm } from "@/components/deal-form";
import { chipClass } from "@/components/chip";
import { cn } from "@/lib/utils";
import { getItems, getPricesForItem, getStores } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ReportPage({ searchParams }: PageProps<"/report">) {
  const sp = await searchParams;
  const itemId = typeof sp.item === "string" ? sp.item : "";
  const storeId = typeof sp.store === "string" ? sp.store : "";
  const newItem = typeof sp.newItem === "string" ? sp.newItem.slice(0, 80) : undefined;
  const deal = sp.type === "deal";
  const [items, stores] = await Promise.all([getItems(), getStores()]);
  const sortedStores = [...stores].sort((a, b) => a.name.localeCompare(b.name));
  const sortedItems = [...items].sort((a, b) => a.name.localeCompare(b.name));
  const item = items.find((i) => i.id === itemId);
  const prices = item ? await getPricesForItem(item.id) : [];

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">{deal ? "Share free food or a deal" : "Report a price"}</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        {deal ? "Pop-ups, free food, and discounts. People nearby get it in one bundled alert." : "What did you pay? Every person gets one vote per item and store."}
      </p>
      <div className="mb-4 flex gap-2">
        <Link href={`/report${storeId ? `?store=${storeId}` : ""}`} className={chipClass(!deal)} scroll={false}>Price</Link>
        <Link href={`/report?type=deal${storeId ? `&store=${storeId}` : ""}`} className={cn(chipClass(deal), "normal-case")} scroll={false}>Free food or deal</Link>
      </div>
      {deal ? (
        <DealForm stores={sortedStores} storeId={storeId} />
      ) : (
        <>
          <Link href="/scan" className="mb-4 flex items-center gap-3 rounded-xl border bg-brand-soft p-3 text-sm hover:opacity-90">
            <Camera className="size-5 shrink-0 text-primary" />
            <span>
              <strong>Have a receipt?</strong> Scan it and add every price at once.
            </span>
          </Link>
          <ReportForm items={sortedItems} stores={sortedStores} itemId={item ? itemId : ""} storeId={storeId} newItemName={newItem} />
          {item && (
            <section className="mt-6">
              <LiveRefresh name="reports" field="itemId" value={item.id} />
              <h2 className="mb-2 font-semibold">{item.name} across NYC</h2>
              <PriceList prices={prices} stores={new Map(stores.map((s) => [s.id, s]))} highlight={storeId} />
            </section>
          )}
        </>
      )}
    </>
  );
}
