import { Beef, Carrot, Coffee, Croissant, Milk, Package, Sandwich, type LucideIcon } from "lucide-react";
import type { Category } from "@/lib/types";
import { cn } from "@/lib/utils";

// Every aisle keeps one produce color and icon, everywhere it appears.
export const CATEGORY_STYLE: Record<Category, { color: string; icon: LucideIcon }> = {
  produce: { color: "#9be15d", icon: Carrot },
  dairy: { color: "#8fd3ff", icon: Milk },
  meat: { color: "#ff9c8f", icon: Beef },
  bakery: { color: "#f9cc66", icon: Croissant },
  pantry: { color: "#c9a4ff", icon: Package },
  coffee: { color: "#dcb28c", icon: Coffee },
  "prepared food": { color: "#ffb067", icon: Sandwich },
};

// A colored disc with the aisle's icon. The icon stays aubergine so it reads on every color.
export function CategoryIcon({ category, className }: { category: string; className?: string }) {
  const style = CATEGORY_STYLE[category as Category];
  if (!style) return null;
  const Icon = style.icon;
  return (
    <span aria-hidden className={cn("grid size-7 shrink-0 place-items-center rounded-full text-[#2a1338]", className)} style={{ backgroundColor: style.color }}>
      <Icon className="size-[55%]" strokeWidth={2.25} />
    </span>
  );
}
