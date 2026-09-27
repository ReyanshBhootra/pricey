import { Price } from "@/components/price";
import { cn } from "@/lib/utils";

const TONES = {
  lime: "bg-lime text-lime-foreground",
  tangerine: "bg-tangerine text-tangerine-foreground",
};

const SIZES = {
  sm: "size-16 text-lg",
  md: "size-20 text-2xl",
  lg: "size-28 text-4xl",
};

// A round produce sticker with a price and a one-word label ("cheapest", "free").
// `slap` animates it landing, after `delay` ms. Tilt is fixed so it never jitters on re-render.
export function Sticker({
  price,
  label,
  tone = "lime",
  size = "md",
  slap,
  delay = 0,
  tilt = -8,
  className,
}: {
  price?: number;
  label: string;
  tone?: keyof typeof TONES;
  size?: keyof typeof SIZES;
  slap?: boolean;
  delay?: number;
  tilt?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "sticker inline-grid shrink-0 place-content-center rounded-full text-center leading-none shadow-[inset_0_0_0_3px_rgb(255_255_255/0.45),0_6px_16px_-6px_rgb(42_19_56/0.45)]",
        TONES[tone],
        SIZES[size],
        slap && "sticker-slap",
        className,
      )}
      style={{ "--tilt": `${tilt}deg`, "--delay": `${delay}ms` } as React.CSSProperties}
    >
      {price !== undefined && <Price value={price} />}
      <span className="mt-0.5 text-[0.62rem] font-extrabold tracking-wide">{label}</span>
    </span>
  );
}
