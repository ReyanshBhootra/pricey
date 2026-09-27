import { ChevronRight, Receipt } from "lucide-react";
import Link from "next/link";
import { LiveRefresh } from "@/components/live-refresh";
import { PriceList } from "@/components/price-list";
import { ReportForm } from "@/components/report-form";
import { DealForm } from "@/components/deal-form";
import { cn } from "@/lib/utils";
import { getItems, getPricesForItem, getStores } from "@/lib/data";
import { LoginGate } from "@/components/login-gate";
import { sessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const tab = "rounded-full px-4 py-1.5 text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:hover:text-inherit";

export default async function ReportPage({ searchParams }: PageProps<"/report">) {
  const sp = await searchParams;
  const itemId = typeof sp.item === "string" ? sp.item : "";
  const storeId = typeof sp.store === "string" ? sp.store : "";
  const newItem = typeof sp.newItem === "string" ? sp.newItem.slice(0, 80) : undefined;
  const deal = sp.type === "deal";
  const [items, stores, account] = await Promise.all([getItems(), getStores(), sessionUserId()]);
  const here = `/report?${new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string"))}`;
  const sortedStores = [...stores].sort((a, b) => a.name.localeCompare(b.name));
  const sortedItems = [...items].sort((a, b) => a.name.localeCompare(b.name));
  const item = items.find((i) => i.id === itemId);
  const prices = item ? await getPricesForItem(item.id) : [];

  return (
    <>
      <h1 className="mb-2 text-[2.6rem] leading-[0.95]">{deal ? "Share free food or a deal" : "Report a price"}</h1>
      <p className="mb-5 text-muted-foreground">
        {deal ? "Pop-ups, free food, and discounts. People nearby get it in one bundled alert." : "What did you pay? Every person gets one vote per item and store."}
      </p>
      <div className="mb-5 inline-flex rounded-full border bg-card p-1 text-sm font-semibold">
        <Link href={`/report${storeId ? `?store=${storeId}` : ""}`} aria-current={!deal ? "page" : undefined} className={cn(tab, !deal && "bg-primary text-primary-foreground")} scroll={false}>
          Price
        </Link>
        <Link href={`/report?type=deal${storeId ? `&store=${storeId}` : ""}`} aria-current={deal ? "page" : undefined} className={cn(tab, deal && "bg-tangerine text-tangerine-foreground")} scroll={false}>
          Free food or deal
        </Link>
      </div>
      {!account ? (
        <LoginGate action={deal ? "share free food or a deal" : "report a price"} next={here} />
      ) : deal ? (
        <DealForm stores={sortedStores} storeId={storeId} />
      ) : (
        <>
          <Link href="/scan" className="group mb-4 flex items-center gap-3 rounded-[1.25rem] bg-hero p-3 pr-4 text-hero-foreground">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-lime text-lime-foreground">
              <Receipt className="size-5" />
            </span>
            <span className="text-sm">
              <strong className="block text-base">Have a receipt?</strong>
              <span className="text-hero-muted">Scan it and add every price at once.</span>
            </span>
            <ChevronRight className="ml-auto size-5 shrink-0 text-hero-muted transition-transform group-hover:translate-x-0.5" />
          </Link>
          <ReportForm items={sortedItems} stores={sortedStores} itemId={item ? itemId : ""} storeId={storeId} newItemName={newItem} />
          {item && (
            <section className="mt-6">
              <LiveRefresh name="reports" field="itemId" value={item.id} />
              <h2 className="mb-3 font-display text-2xl">{item.name} across NYC</h2>
              <PriceList prices={prices} stores={new Map(stores.map((s) => [s.id, s]))} highlight={storeId} />
            </section>
          )}
        </>
      )}
    </>
  );
}
