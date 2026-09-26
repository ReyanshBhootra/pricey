"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { submitReportAction, type ReportState } from "@/lib/actions";
import { money } from "@/lib/format";
import { CATEGORIES, type Item, type Store } from "@/lib/types";

export function ReportForm({ items, stores, itemId, storeId }: { items: Item[]; stores: Store[]; itemId: string; storeId: string }) {
  const router = useRouter();
  const [item, setItem] = useState(itemId);
  const [store, setStore] = useState(storeId);
  const [price, setPrice] = useState("");
  const [state, action, pending] = useActionState<ReportState, FormData>(async (prev, form) => {
    const next = await submitReportAction(prev, form);
    if (next?.ok) setPrice("");
    return next;
  }, null);

  // Keep the URL in sync so the live price list below follows the form.
  const sync = (nextItem: string, nextStore: string) => {
    const q = new URLSearchParams();
    if (nextItem) q.set("item", nextItem);
    if (nextStore) q.set("store", nextStore);
    router.replace(`/report?${q}`, { scroll: false });
  };

  const field = "w-full rounded-lg border border-line bg-card px-3 py-2.5";

  return (
    <form action={action} className="space-y-3 rounded-xl border border-line bg-card p-4">
      <label className="block text-sm">
        <span className="mb-1 block text-muted">Item</span>
        <select name="itemId" required value={item} onChange={(e) => (setItem(e.target.value), sync(e.target.value, store))} className={field}>
          <option value="">Pick an item</option>
          {CATEGORIES.map((c) => (
            <optgroup key={c} label={c}>
              {items.filter((i) => i.category === c).map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-muted">Store</span>
        <select name="storeId" required value={store} onChange={(e) => (setStore(e.target.value), sync(item, e.target.value))} className={field}>
          <option value="">Pick a store</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>{s.name} ({s.borough})</option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-muted">Price you saw</span>
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">$</span>
          <input
            name="price"
            required
            inputMode="decimal"
            type="number"
            step="0.01"
            min="0"
            placeholder="3.49"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className={`${field} pl-7`}
          />
        </div>
      </label>

      <button disabled={pending} className="w-full rounded-lg bg-accent py-2.5 font-medium text-white disabled:opacity-60 dark:text-black">
        {pending ? "Saving..." : "Submit price"}
      </button>

      {state && !state.ok && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && (
        <p className="rounded-lg bg-accent-soft p-3 text-sm">
          {state.result.priceChanged
            ? `Thanks! Your report moved the trusted price from ${money(state.result.oldPrice!)} to ${money(state.result.newPrice!)}.`
            : state.result.oldPrice === null
              ? `Thanks! You're the first to report this, so it's now listed at ${money(state.result.newPrice!)}.`
              : `Thanks! Counted. The trusted price is ${money(state.result.newPrice!)}.`}
        </p>
      )}
    </form>
  );
}
