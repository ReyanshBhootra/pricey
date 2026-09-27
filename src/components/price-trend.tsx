// A small trend line of the city's typical price over the last month, with "Up 18% this month".
// Server-rendered SVG: no chart library needed.
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { describeChange, type PriceHistory } from "@/lib/history";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

export function PriceTrend({ history, days = 30 }: { history: PriceHistory; days?: number }) {
  const { points, changePct } = history;
  const label = describeChange(changePct, days);
  if (points.length < 2 || !label) return null;

  const W = 240;
  const H = 48;
  const prices = points.map((p) => p.price);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const span = hi - lo || 1;
  const t0 = points[0].at;
  const t1 = points.at(-1)!.at;
  const x = (at: number) => ((at - t0) / (t1 - t0 || 1)) * (W - 4) + 2;
  const y = (p: number) => H - 4 - ((p - lo) / span) * (H - 8);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.at).toFixed(1)},${y(p.price).toFixed(1)}`).join(" ");

  const flat = Math.abs(changePct!) < 2;
  const up = !flat && changePct! > 0;
  const tone = flat ? "text-muted-foreground" : up ? "text-hike" : "text-drop";
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;

  return (
    <div className="mb-6 flex items-center gap-4 rounded-[1.25rem] border bg-card p-4">
      <div className="min-w-0 flex-1">
        <p className={cn("flex items-center gap-1.5 text-sm font-semibold", tone)}>
          <Icon className="size-4" /> {label}
        </p>
        <p className="text-xs text-muted-foreground">
          Typical NYC price {money(points[0].price)} then, {money(points.at(-1)!.price)} now
        </p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className={cn("h-12 w-36 shrink-0 sm:w-48", tone)} role="img" aria-label={`${label}: price trend over ${days} days`}>
        <path d={path} fill="none" stroke="currentColor" strokeWidth="3" pathLength={1} className="trend-draw" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
