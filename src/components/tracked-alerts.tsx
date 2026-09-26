"use client";

import Link from "next/link";
import { money, timeAgo } from "@/lib/format";
import type { PriceChange } from "@/lib/types";
import { useTracked } from "./track-button";

type Change = PriceChange & { itemName: string; storeName: string };

export function TrackedAlerts({ changes }: { changes: Change[] }) {
  const tracked = useTracked();
  if (!tracked) return null;

  const mine = changes.filter((c) => tracked.includes(c.itemId)).slice(0, 5);
  if (mine.length === 0) return null;

  return (
    <section className="mb-5 rounded-xl border border-line bg-warn-soft p-4">
      <h2 className="mb-2 text-sm font-semibold">Price changes on items you track</h2>
      <ul className="space-y-1 text-sm">
        {mine.map((c) => (
          <li key={c.id}>
            <Link href={`/item/${c.itemId}`} className="underline-offset-2 hover:underline">
              {c.itemName}
            </Link>{" "}
            at {c.storeName}: {money(c.oldPrice)} → <strong>{money(c.newPrice)}</strong>{" "}
            <span className="text-muted">{timeAgo(c.timestamp)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
