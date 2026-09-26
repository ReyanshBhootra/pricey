// Placeholder home that proves the core loop reads end to end.
// Person B replaces this with the real nearby view.
import { getItems, getPricesForItem, getStores } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: PageProps<"/">) {
  const { item } = await searchParams;
  const [items, stores] = await Promise.all([getItems(), getStores()]);
  const itemId = typeof item === "string" ? item : "potatoes-5lb";
  const prices = await getPricesForItem(itemId);
  const storeName = new Map(stores.map((s) => [s.id, `${s.name} (${s.borough})`]));

  return (
    <main className="mx-auto w-full max-w-xl p-4">
      <h1 className="text-2xl font-semibold">Pricey</h1>
      <p className="mb-4 text-sm text-neutral-500">Trusted prices, cheapest first.</p>
      <nav className="mb-4 flex flex-wrap gap-2 text-sm">
        {items.map((i) => (
          <a
            key={i.id}
            href={`/?item=${i.id}`}
            className={`rounded-full border px-3 py-1 ${i.id === itemId ? "bg-black text-white" : ""}`}
          >
            {i.name}
          </a>
        ))}
      </nav>
      <ul className="divide-y rounded-lg border">
        {prices.map((p) => (
          <li key={p.storeId} className="flex justify-between gap-4 p-3">
            <span>{storeName.get(p.storeId) ?? p.storeId}</span>
            <span className="text-right">
              <strong>${p.price.toFixed(2)}</strong>
              <span className="block text-xs text-neutral-500">
                {p.votes} of {p.totalReports} agree
              </span>
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
