"use client";

import { CircleUserRound, MapPin, MessagesSquare, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Nearby", icon: MapPin },
  { href: "/report", label: "Report", icon: Plus },
  { href: "/chat", label: "Ask", icon: Sparkles },
  { href: "/forum", label: "Forum", icon: MessagesSquare },
];

export function Nav({ signedIn }: { signedIn: boolean }) {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-2.5">
        <Link href="/" className="text-xl font-bold tracking-tight">
          pricey<span className="text-primary">.</span>
        </Link>
        <nav className="flex gap-1 text-sm">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? path === "/" : path.startsWith(href) || (href === "/report" && path.startsWith("/scan"));
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2 py-1.5 transition-colors sm:px-3",
                  active ? "bg-foreground text-background" : "hover:bg-accent",
                )}
              >
                <Icon className="hidden size-4 sm:block" />
                {label}
              </Link>
            );
          })}
          <Link
            href={signedIn ? "/profile" : "/login"}
            aria-label={signedIn ? "Your profile" : "Log in"}
            className={cn(
              "ml-0.5 grid size-8 place-items-center rounded-full transition-colors sm:size-9",
              path.startsWith("/profile") || path.startsWith("/login") ? "bg-foreground text-background" : "hover:bg-accent",
            )}
          >
            <CircleUserRound className={cn("size-5", signedIn && "text-primary")} />
          </Link>
        </nav>
      </div>
    </header>
  );
}
