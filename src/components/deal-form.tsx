"use client";

import { BadgePercent } from "lucide-react";
import { startTransition, useActionState, useState } from "react";
import { selectClass } from "@/components/chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitDealAction, type DealState } from "@/lib/actions";
import { BOROUGHS, type Store } from "@/lib/types";

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
      className="flex flex-col gap-5 rounded-[1.5rem] border bg-card p-4"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="what">What is it?</Label>
        <Input id="what" name="what" required maxLength={200} value={what} onChange={(e) => setWhat(e.target.value)} placeholder="Free bagels until 5pm, $1 coffee pop-up…" />
      </div>
      <div className="flex flex-col gap-1.5">
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
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="dealPrice">Price (leave empty if free)</Label>
        <div className="relative">
          {price && <span className="pointer-events-none absolute top-1/2 left-4 z-10 -translate-y-1/2 font-display text-xl text-tangerine-foreground">$</span>}
          <Input id="dealPrice" name="price" inputMode="decimal" type="number" step="0.01" min="0" max="1000" placeholder="Free" value={price} onChange={(e) => setPrice(e.target.value)} className="h-14 rounded-2xl border-transparent bg-tangerine pl-10 font-display text-3xl text-tangerine-foreground tabular-nums placeholder:text-tangerine-foreground/45 focus-visible:ring-ring md:text-3xl dark:bg-tangerine" />
        </div>
      </div>
      <Button disabled={pending} size="lg" variant="tangerine" className="w-full">
        {pending ? "Posting…" : "Post it"}
      </Button>
      {state && !state.ok && <p className="text-sm text-destructive">{state.error}</p>}
      {state?.ok && (
        <p role="status" className="flex items-center gap-3 rounded-2xl bg-warn-soft p-3 text-sm animate-in fade-in zoom-in-95">
          <BadgePercent className="size-6 shrink-0" />
          <span>
            {state.note.startsWith("ENDED: ")
              ? "Thanks! That spot's deals are off the list now."
              : "Posted! It shows up in the deals banner for people nearby, and in texted alerts."}
          </span>
        </p>
      )}
    </form>
  );
}
