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
    <form onSubmit={go} className="relative mb-4">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        list="pricey-items"
        placeholder="How much are eggs? Search an item"
        aria-label="Search an item"
        className="h-11 bg-card pl-9"
      />
      <datalist id="pricey-items">
        {items.map((i) => (
          <option key={i.id} value={i.name} />
        ))}
      </datalist>
    </form>
  );
}
