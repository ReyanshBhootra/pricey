import { ReceiptScanner } from "@/components/receipt-scanner";
import { getItems, getStores } from "@/lib/data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Scan a receipt · Pricey" };

export default async function ScanPage() {
  const [items, stores] = await Promise.all([getItems(), getStores()]);
  return (
    <>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Scan a receipt</h1>
      <p className="mb-4 text-sm text-muted-foreground">One photo adds every price on it. You check them before anything is saved.</p>
      <ReceiptScanner items={items} stores={[...stores].sort((a, b) => a.name.localeCompare(b.name))} />
    </>
  );
}
