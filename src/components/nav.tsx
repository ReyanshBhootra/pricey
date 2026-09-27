"use client";

import { CircleUserRound, ListChecks, MapPin, MessagesSquare, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Nearby", icon: MapPin },
  { href: "/list", label: "List", icon: ListChecks },
  { href: "/report", label: "Report", icon: Plus },
  { href: "/chat", label: "Ask", icon: Sparkles },
  { href: "/forum", label: "Forum", icon: MessagesSquare },
];

const isActive = (href: string, path: string) =>
  href === "/" ? path === "/" : path.startsWith(href) || (href === "/report" && path.startsWith("/scan"));

// A pill that slides under whichever tab is active. The nav stays mounted between pages,
// so a plain CSS transition on its position does the gliding.
function useIndicator(path: string) {
  const box = useRef<HTMLElement>(null);
  const [style, setStyle] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = box.current?.querySelector<HTMLElement>("[data-tab][aria-current=page]");
      setStyle(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [path]);
  return [box, style] as const;
}

const pill = "pointer-events-none absolute inset-y-1.5 rounded-full transition-[left,width,opacity] duration-400 ease-[cubic-bezier(0.3,1.3,0.5,1)] motion-reduce:transition-none";

export function Nav({ signedIn }: { signedIn: boolean }) {
  const path = usePathname();
  const onProfile = path.startsWith("/profile") || path.startsWith("/login");
  const [top, topPill] = useIndicator(path);
  const [bottom, bottomPill] = useIndicator(path);
  return (
    <>
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md [view-transition-name:site-header]">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-1.5 font-display text-[1.7rem] leading-none" aria-label="Pricey home">
            pricey
            <span aria-hidden className="sticker grid size-6 place-items-center rounded-full bg-lime text-[0.7rem] text-lime-foreground [--tilt:12deg]">
              $
            </span>
          </Link>

          {/* Tablet and up: tabs in the header. */}
          <nav ref={top} aria-label="Main" className="relative hidden items-center gap-1 py-1.5 text-sm font-semibold sm:flex">
            <span aria-hidden className={cn(pill, "bg-primary", !topPill && "opacity-0")} style={topPill ?? undefined} />
            {LINKS.map(({ href, label, icon: Icon }) => {
              const active = isActive(href, path);
              return (
                <Link
                  key={href}
                  href={href}
                  data-tab
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative inline-flex h-9 items-center gap-1.5 rounded-full px-3 transition-colors duration-300 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                </Link>
              );
            })}
          </nav>

          <Link
            href={signedIn ? "/profile" : "/login"}
            aria-label={signedIn ? "Your profile" : "Log in"}
            className={cn(
              "grid size-10 place-items-center rounded-full border transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              onProfile ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-foreground/30",
            )}
          >
            <CircleUserRound className={cn("size-5", signedIn && !onProfile && "text-drop")} />
          </Link>
        </div>
      </header>

      {/* Phones: a floating tab bar with Report as the big button in the middle. */}
      <nav
        ref={bottom}
        aria-label="Main"
        className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-md items-center justify-between rounded-full bg-hero p-1.5 text-hero-foreground shadow-[0_12px_32px_-8px_rgb(42_19_56/0.55)] ring-1 ring-white/10 [view-transition-name:tab-bar] sm:hidden"
      >
        <span aria-hidden className={cn(pill, "bg-lime", !bottomPill && "opacity-0")} style={bottomPill ?? undefined} />
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active = isActive(href, path);
          if (href === "/report")
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                aria-label="Report a price"
                className="relative -my-5 grid size-15 shrink-0 place-items-center rounded-full bg-lime text-lime-foreground shadow-lg ring-4 ring-background transition-transform outline-none active:scale-90 focus-visible:ring-ring"
              >
                <Plus className="size-7" strokeWidth={2.75} />
              </Link>
            );
          return (
            <Link
              key={href}
              href={href}
              data-tab
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[0.7rem] font-semibold transition-colors duration-300 outline-none focus-visible:ring-2 focus-visible:ring-lime",
                active ? "text-lime-foreground" : "text-hero-muted",
              )}
            >
              <Icon className="size-5" />
              {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
