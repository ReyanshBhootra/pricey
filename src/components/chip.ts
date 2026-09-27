import { cn } from "@/lib/utils";

export const chipClass = (active: boolean) =>
  cn(
    "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-[color,background-color,border-color,transform] outline-none active:scale-95 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50",
    active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-foreground/30",
  );

// Native select styled like the shadcn Input: works everywhere, great on phones.
export const selectClass =
  "h-11 w-full rounded-xl border border-input bg-card px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm";
