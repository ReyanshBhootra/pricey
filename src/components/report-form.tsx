"use client";

import { CheckCircle2, LocateFixed } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitReportAction, type ReportState } from "@/lib/actions";
import { inNyc, money } from "@/lib/format";
import { BOROUGHS, CATEGORIES, type Item, type Store } from "@/lib/types";
import { cn } from "@/lib/utils";

const NEW = "__new";

// Native select styled like the shadcn Input: works everywhere, great on phones.
const selectClass =
  "h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

type Props = { items: Item[]; stores: Store[]; itemId: string; storeId: string; newItemName?: string };

export function ReportForm({ items, stores, itemId, storeId, newItemName }: Props) {
  const router = useRouter();
  const [item, setItem] = useState(newItemName ? NEW : itemId);
  const [store, setStore] = useState(storeId);
  const [price, setPrice] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locMsg, setLocMsg] = useState("");

  const [state, action, pending] = useActionState<ReportState, FormData>(async (prev, form) => {
    const next = await submitReportAction(prev, form);
    if (next?.ok) {
      const { itemId: i, storeId: s } = next.result.report;
      setPrice("");
      setItem(i);
      setStore(s);
      router.replace(`/report?item=${i}&store=${s}`, { scroll: false });
    }
    return next;
  }, null);

  // Keep the URL in sync so the live price list below follows the form.
  const sync = (nextItem: string, nextStore: string) => {
    const q = new URLSearchParams();
    if (nextItem && nextItem !== NEW) q.set("item", nextItem);
    if (nextStore && nextStore !== NEW) q.set("store", nextStore);
    router.replace(`/report?${q}`, { scroll: false });
  };

  const useMyLocation = () => {
    setLocMsg("Finding you...");
    navigator.geolocation?.getCurrentPosition(
      ({ coords: c }) => {
        if (inNyc(c.latitude, c.longitude)) {
          setCoords({ lat: c.latitude, lng: c.longitude });
          setLocMsg("Pinned to your location.");
        } else setLocMsg("You look to be outside NYC, so we'll pin it to the borough.");
      },
      () => setLocMsg("Location blocked, so we'll pin it to the borough."),
    );
  };

  return (
    <form
      // onSubmit instead of action={...}: React resets forms after an action, which would clear the pickers.
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
      className="space-y-4 rounded-xl border bg-card p-4 shadow-xs"
    >
      <div className="space-y-1.5">
        <Label htmlFor="itemId">Item</Label>
        <select id="itemId" name="itemId" required value={item} onChange={(e) => (setItem(e.target.value), sync(e.target.value, store))} className={selectClass}>
          <option value="">Pick an item</option>
          <option value={NEW}>+ Add a new item</option>
          {CATEGORIES.map((c) => (
            <optgroup key={c} label={c}>
              {items.filter((i) => i.category === c).map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
        {item === NEW && (
          <div className="grid grid-cols-[1fr_auto] gap-2 pt-1">
            <Input name="newItemName" required maxLength={80} defaultValue={newItemName} placeholder="e.g. Oat milk (half gallon)" aria-label="New item name" />
            <select name="newItemCategory" required defaultValue="" aria-label="New item category" className={cn(selectClass, "w-auto capitalize")}>
              <option value="" disabled>Category</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="storeId">Store</Label>
        <select id="storeId" name="storeId" required value={store} onChange={(e) => (setStore(e.target.value), sync(item, e.target.value))} className={selectClass}>
          <option value="">Pick a store</option>
          <option value={NEW}>+ Add a new store</option>
          {BOROUGHS.map((b) => (
            <optgroup key={b} label={b}>
              {stores.filter((s) => s.borough === b).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
        {store === NEW && (
          <div className="space-y-2 pt-1">
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Input name="newStoreName" required maxLength={100} placeholder="e.g. Associated on 5th Ave" aria-label="New store name" />
              <select name="newStoreBorough" required defaultValue="" aria-label="New store borough" className={cn(selectClass, "w-auto")}>
                <option value="" disabled>Borough</option>
                {BOROUGHS.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
            <input type="hidden" name="newStoreLat" value={coords?.lat ?? ""} />
            <input type="hidden" name="newStoreLng" value={coords?.lng ?? ""} />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Button type="button" variant="outline" size="sm" onClick={useMyLocation}>
                <LocateFixed /> I&apos;m at this store
              </Button>
              <span>{locMsg || "Optional. Puts the store on the nearby list at the right spot."}</span>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="price">Price you saw</Label>
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">$</span>
          <Input
            id="price"
            name="price"
            required
            inputMode="decimal"
            type="number"
            step="0.01"
            min="0"
            max="1000"
            placeholder="3.49"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="pl-7"
          />
        </div>
      </div>

      <Button disabled={pending} size="lg" className="w-full">
        {pending ? "Saving..." : "Submit price"}
      </Button>

      {state && !state.ok && <p className="text-sm text-destructive">{state.error}</p>}
      {state?.ok && (
        <p className="flex gap-2 rounded-lg bg-brand-soft p-3 text-sm">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>
            {state.result.priceChanged
              ? `Thanks! Your report moved the trusted price from ${money(state.result.oldPrice!)} to ${money(state.result.newPrice!)}.`
              : state.result.oldPrice === null
                ? `Thanks! You're the first to report this, so it's now listed at ${money(state.result.newPrice!)}.`
                : state.result.newPrice === state.result.report.price
                  ? `Thanks! You agree with the trusted price of ${money(state.result.newPrice!)}.`
                  : `Thanks! Counted. Most people still say ${money(state.result.newPrice!)}, so that stays the trusted price until more agree with you.`}
          </span>
        </p>
      )}
    </form>
  );
}
