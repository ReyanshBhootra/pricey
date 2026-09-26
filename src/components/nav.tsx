import Link from "next/link";

const LINKS = [
  { href: "/", label: "Nearby" },
  { href: "/report", label: "Report" },
  { href: "/forum", label: "Forum" },
];

export function Nav() {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-bold tracking-tight">
          pricey<span className="text-accent">.</span>
        </Link>
        <nav className="flex gap-1 text-sm">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-full px-3 py-1.5 hover:bg-card">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
