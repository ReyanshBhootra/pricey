"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import type { Item } from "@/lib/types";

// "How much are eggs?" Type an item, jump to its price across the city.
export function ItemSearch({ items }: { items: Item[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");

  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const needle = q.trim().toLowerCase();
    if (!needle) return;
    const hit =
      items.find((i) => i.name.toLowerCase() === needle) ??
      items.find((i) => i.name.toLowerCase().startsWith(needle)) ??
      items.find((i) => i.name.toLowerCase().includes(needle));
    if (hit) router.push(`/item/${hit.id}`);
    else router.push(`/report?newItem=${encodeURIComponent(q.trim())}`);
  };

  return (
    <form onSubmit={go} className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-4 z-10 size-5 -translate-y-1/2 text-[#6b5f76]" />
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        list="pricey-items"
        placeholder="How much are eggs?"
        aria-label="Search an item"
        className="h-13 rounded-full border-transparent bg-field pl-12 text-base text-field-foreground shadow-lg placeholder:text-[#6b5f76] focus-visible:ring-lime/70 md:text-base dark:bg-field"
      />
      <datalist id="pricey-items">
        {items.map((i) => (
          <option key={i.id} value={i.name} />
        ))}
      </datalist>
    </form>
  );
}
