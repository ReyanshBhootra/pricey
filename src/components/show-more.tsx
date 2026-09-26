"use client";

import { ChevronDown } from "lucide-react";
import { Children, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Shows the first `initial` rows of a list, with a toggle at the bottom for the rest.
export function ShowMore({ children, initial = 5, className }: { children: ReactNode; initial?: number; className?: string }) {
  const [open, setOpen] = useState(false);
  const rows = Children.toArray(children);
  const hidden = rows.length - initial;

  return (
    <>
      <ul className={className}>{open || hidden <= 0 ? rows : rows.slice(0, initial)}</ul>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="mt-1 inline-flex items-center gap-1 rounded-md py-1 text-sm font-medium text-primary hover:underline"
        >
          {open ? "Show less" : `Show ${hidden} more`}
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
        </button>
      )}
    </>
  );
}
