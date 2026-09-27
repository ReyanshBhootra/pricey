"use client";

// Shown on prices nobody has confirmed in a week: "Still $3.99?" Yes adds a fresh vote;
// "Changed" opens the report form for that item and store.
import Link from "next/link";
import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { confirmPriceAction } from "@/lib/actions";
import { money } from "@/lib/format";

export function StillPrice({ itemId, storeId, price, estimated }: { itemId: string; storeId: string; price: number; estimated?: boolean }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<"ask" | "done" | string>("ask");

  if (state === "done") {
    return (
      <span className="flex items-center justify-end gap-1 text-xs text-green-700 dark:text-green-400">
        <Check className="size-3" /> Thanks, confirmed
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center justify-end gap-x-2 text-xs">
      <span className="text-muted-foreground">{estimated ? "Estimate. Right price?" : `Still ${money(price)}?`}</span>
      <button
        type="button"
        disabled={pending}
        className="font-medium text-primary hover:underline disabled:opacity-50"
        onClick={() =>
          start(async () => {
            const r = await confirmPriceAction(itemId, storeId, price);
            setState(r.ok ? "done" : (r.error ?? "Try again"));
          })
        }
      >
        {pending ? "Saving" : "Yes"}
      </button>
      <Link href={`/report?item=${itemId}&store=${storeId}`} className="font-medium text-primary hover:underline">
        Changed
      </Link>
      {state !== "ask" && <span className="basis-full text-right text-destructive">{state}</span>}
    </span>
  );
}
