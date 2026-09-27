import { ReceiptScanner } from "@/components/receipt-scanner";
import { LoginGate } from "@/components/login-gate";
import { getItems, getStores } from "@/lib/data";
import { sessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Scan a receipt · Pricey" };

export default async function ScanPage() {
  const [items, stores, account] = await Promise.all([getItems(), getStores(), sessionUserId()]);
  return (
    <>
      <h1 className="mb-2 text-[2.6rem] leading-[0.95]">Scan a receipt</h1>
      <p className="mb-5 text-muted-foreground">One photo adds every price on it. You check them before anything is saved.</p>
      {!account ? <LoginGate action="scan receipts" next="/scan" /> : <ReceiptScanner items={items} stores={[...stores].sort((a, b) => a.name.localeCompare(b.name))} />}
    </>
  );
}
