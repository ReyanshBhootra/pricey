"use client";

import { MapPin, MessagesSquare, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Nearby", icon: MapPin },
  { href: "/report", label: "Report", icon: Plus },
  { href: "/forum", label: "Forum", icon: MessagesSquare },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-2.5">
        <Link href="/" className="text-xl font-bold tracking-tight">
          pricey<span className="text-primary">.</span>
        </Link>
        <nav className="flex gap-1 text-sm">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? path === "/" : path.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors",
                  active ? "bg-foreground text-background" : "hover:bg-accent",
                )}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
