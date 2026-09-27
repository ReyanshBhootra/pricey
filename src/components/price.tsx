import { cn } from "@/lib/utils";

// A price the way a market chalkboard writes it: $3 with smaller .49. Free is just "Free".
// Screen readers get the plain "$3.49"; the styled pieces are hidden from them.
export function Price({ value, className }: { value: number; className?: string }) {
  if (value === 0) return <span className={cn("font-display", className)}>Free</span>;
  const [dollars, cents] = value.toFixed(2).split(".");
  return (
    <span className={cn("font-display whitespace-nowrap tabular-nums", className)}>
      <span className="sr-only">
        ${dollars}.{cents}
      </span>
      <span aria-hidden>
        <span className="text-[0.62em]">$</span>
        {dollars}
        <span className="text-[0.62em]">.{cents}</span>
      </span>
    </span>
  );
}
