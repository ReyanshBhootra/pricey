// Shown where logged-out visitors would add data: browsing is open to everyone, but every
// price, deal, and post belongs to a real phone number (that's what makes vouching honest).
import { LogIn } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function LoginGate({ action, next }: { action: string; next: string }) {
  return (
    <div className="mb-5 flex flex-col items-center rounded-[1.5rem] border-2 border-dashed bg-card p-6 text-center">
      <span className="sticker mb-3 grid size-14 place-items-center rounded-full bg-lime text-lime-foreground">
        <LogIn className="size-6" />
      </span>
      <p className="mb-1 font-display text-xl">Log in to {action}</p>
      <p className="mb-4 text-sm text-muted-foreground">It takes a phone number and a 6-digit code. Every price on Pricey comes from a real person, so one person gets one vote.</p>
      <Button asChild>
        <Link href={`/login?next=${encodeURIComponent(next)}`}>
          <LogIn data-icon="inline-start" /> Log in
        </Link>
      </Button>
    </div>
  );
}
