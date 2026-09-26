"use client";

import { CheckCircle2 } from "lucide-react";
import { startTransition, useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitDealAction, type DealState } from "@/lib/actions";
import { BOROUGHS, type Store } from "@/lib/types";

const selectClass =
  "h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

// Free food, pop-ups, and discounts: same reports pipeline as prices, type "event".
export function DealForm({ stores, storeId }: { stores: Store[]; storeId: string }) {
  const [what, setWhat] = useState("");
  const [price, setPrice] = useState("");
  const [state, action, pending] = useActionState<DealState, FormData>(async (prev, form) => {
    const next = await submitDealAction(prev, form);
    if (next?.ok) {
      setWhat("");
      setPrice("");
    }
    return next;
  }, null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
      className="space-y-4 rounded-xl border bg-card p-4 shadow-xs"
    >
      <div className="space-y-1.5">
        <Label htmlFor="what">What is it?</Label>
        <Input id="what" name="what" required maxLength={200} value={what} onChange={(e) => setWhat(e.target.value)} placeholder="Free bagels until 5pm, $1 coffee pop-up..." />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="dealStore">Where?</Label>
        <select id="dealStore" name="storeId" required defaultValue={storeId} className={selectClass}>
          <option value="">Pick a spot</option>
          {BOROUGHS.map((b) => (
            <optgroup key={b} label={b}>
              {stores.filter((s) => s.borough === b).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="dealPrice">Price (leave empty if free)</Label>
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">$</span>
          <Input id="dealPrice" name="price" inputMode="decimal" type="number" step="0.01" min="0" max="1000" placeholder="Free" value={price} onChange={(e) => setPrice(e.target.value)} className="pl-7" />
        </div>
      </div>
      <Button disabled={pending} size="lg" className="w-full">
        {pending ? "Posting..." : "Post it"}
      </Button>
      {state && !state.ok && <p className="text-sm text-destructive">{state.error}</p>}
      {state?.ok && (
        <p className="flex gap-2 rounded-lg bg-brand-soft p-3 text-sm">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>Posted! It shows up in the deals banner for people nearby, and in texted alerts.</span>
        </p>
      )}
    </form>
  );
}
