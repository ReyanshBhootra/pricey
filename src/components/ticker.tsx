"use client";

import { ArrowDown, ArrowUp, Pause, Play } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Price } from "@/components/price";
import { cn } from "@/lib/utils";

export type Tick = { key: string; href: string; name: string; price: number; was?: number; where: string };

// A market ticker of real prices: what just moved, then the cheapest spots nearby.
// Two copies scroll by for a seamless loop. Hover, focus, or the pause button stops it;
// reduced motion makes it swipeable instead.
export function Ticker({ ticks }: { ticks: Tick[] }) {
  const [paused, setPaused] = useState(false);
  if (ticks.length === 0) return null;
  const row = (copy: boolean) =>
    ticks.map((t) => {
      const cents = t.was === undefined ? 0 : Math.round((t.price - t.was) * 100);
      return (
        <li key={`${copy ? "b" : "a"}-${t.key}`} aria-hidden={copy || undefined} className="shrink-0">
          <Link href={t.href} tabIndex={copy ? -1 : undefined} className="flex items-center gap-2 rounded-full py-1 pr-1 text-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-lime">
            <span className="font-semibold">{t.name}</span>
            <Price value={t.price} className="text-base text-lime" />
            {cents !== 0 && (
              <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-bold", cents < 0 ? "bg-lime text-lime-foreground" : "bg-[#ff8a80] text-[#2a1338]")}>
                {cents < 0 ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />}
                {Math.abs(cents) >= 100 ? `$${(Math.abs(cents) / 100).toFixed(2)}` : `${Math.abs(cents)}¢`}
                <span className="sr-only">{cents < 0 ? "down" : "up"}</span>
              </span>
            )}
            <span className="text-hero-muted">{t.where}</span>
          </Link>
        </li>
      );
    });
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1 pr-2">
      <div
        className="ticker min-w-0 flex-1 [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]"
        data-paused={paused || undefined}
        role="region"
        aria-label="Live prices"
        style={{ "--ticker-duration": `${Math.max(24, ticks.length * 5)}s` } as React.CSSProperties}
      >
        <ul className="ticker-track flex w-max gap-7">
          {row(false)}
          {row(true)}
        </ul>
      </div>
      <button
        type="button"
        onClick={() => setPaused(!paused)}
        aria-pressed={paused}
        aria-label={paused ? "Play live prices" : "Pause live prices"}
        className="grid size-8 shrink-0 place-items-center rounded-full text-hero-muted transition-colors outline-none hover:bg-white/10 hover:text-hero-foreground focus-visible:ring-2 focus-visible:ring-lime motion-reduce:hidden"
      >
        {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
      </button>
    </div>
  );
}
