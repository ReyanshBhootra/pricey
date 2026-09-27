import { ReceiptScanner } from "@/components/receipt-scanner";
import { LoginGate } from "@/components/login-gate";
import { getItems, getStores } from "@/lib/data";
import { sessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Scan a receipt · Pricey" };

const STEPS = [
  ["Take a photo", "Flat, well lit, with the whole receipt in frame."],
  ["Check the lines", "Fix any price, untick anything you don't want to share, and confirm the store."],
  ["Save", "Each line becomes a price report, and new items are added for you."],
];

export default async function ScanPage() {
  const [items, stores, account] = await Promise.all([getItems(), getStores(), sessionUserId()]);
  return (
    // Laptop and up: how it works on the left, the scanner on the right.
    <div className="lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-10">
      <div className="lg:sticky lg:top-20">
        <h1 className="mb-2 text-[2.6rem] leading-[0.95] lg:text-[3.5rem]">Scan a receipt</h1>
        <p className="mb-5 text-muted-foreground">One photo adds every price on it. You check them before anything is saved.</p>
        <ol className="hidden flex-col gap-5 rounded-[1.75rem] bg-hero p-7 text-hero-foreground lg:flex">
          {STEPS.map(([title, body], i) => (
            <li key={title} className="flex gap-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-lime font-display text-lg text-lime-foreground">{i + 1}</span>
              <div>
                <p className="text-lg font-bold">{title}</p>
                <p className="text-hero-muted">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <div className="min-w-0">
        {!account ? <LoginGate action="scan receipts" next="/scan" /> : <ReceiptScanner items={items} stores={[...stores].sort((a, b) => a.name.localeCompare(b.name))} />}
      </div>
    </div>
  );
}
