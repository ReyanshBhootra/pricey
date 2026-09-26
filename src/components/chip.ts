import { cn } from "@/lib/utils";

export const chipClass = (active: boolean) =>
  cn(
    "inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-sm capitalize transition-colors",
    active ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-accent",
  );
