"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo } from "react";
import { money, timeAgo } from "@/lib/format";
import type { PriceChange } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useTracked } from "./track-button";

type Change = PriceChange & { itemName: string; storeName: string };
const SEEN_KEY = "pricey_seen_changes";

export function TrackedAlerts({ changes }: { changes: Change[] }) {
  const tracked = useTracked();
  const key = tracked?.join(",");
  const mine = useMemo(() => (key === undefined ? [] : changes.filter((c) => key.split(",").includes(c.itemId)).slice(0, 5)), [changes, key]);

  // Fire one browser notification per change we have not shown before.
  useEffect(() => {
    if (!mine.length || !("Notification" in window) || Notification.permission !== "granted") return;
    try {
      const seen = new Set<string>(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]"));
      for (const c of mine) {
        if (seen.has(c.id)) continue;
        new Notification(`${c.itemName} is now ${money(c.newPrice)}`, { body: `At ${c.storeName}, was ${money(c.oldPrice)}` });
        seen.add(c.id);
      }
      localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-200)));
    } catch {}
  }, [mine]);

  if (mine.length === 0) return null;

  return (
    <section className="mb-5 rounded-[1.5rem] bg-brand-soft p-4">
      <h2 className="mb-2 font-display text-xl">Price changes on items you track</h2>
      <ul className="flex flex-col gap-2 text-sm">
        {mine.map((c) => {
          const down = c.newPrice < c.oldPrice;
          const Icon = down ? TrendingDown : TrendingUp;
          return (
            <li key={c.id} className="flex items-start gap-2.5">
              <Icon className={cn("mt-0.5 size-4 shrink-0", down ? "text-drop" : "text-hike")} />
              <span>
                <Link href={`/item/${c.itemId}`} className="font-semibold hover:underline">
                  {c.itemName}
                </Link>{" "}
                at {c.storeName}{" "}
                <span className="whitespace-nowrap">
                  <s className="text-muted-foreground">{money(c.oldPrice)}</s> <strong className={down ? "text-drop" : "text-hike"}>{money(c.newPrice)}</strong>
                </span>{" "}
                <span className="text-muted-foreground">{timeAgo(c.timestamp)}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
