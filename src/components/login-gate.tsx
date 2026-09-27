// Shown where logged-out visitors would add data: browsing is open to everyone, but every
// price, deal, and post belongs to a real phone number (that's what makes vouching honest).
import { LogIn } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function LoginGate({ action, next }: { action: string; next: string }) {
  return (
    <div className="mb-5 rounded-xl border bg-card p-5 text-center shadow-xs">
      <p className="mb-1 font-semibold">Log in to {action}</p>
      <p className="mb-4 text-sm text-muted-foreground">It takes a phone number and a 6-digit code. Every price on Pricey comes from a real person, so one person gets one vote.</p>
      <Button asChild>
        <Link href={`/login?next=${encodeURIComponent(next)}`}>
          <LogIn /> Log in
        </Link>
      </Button>
    </div>
  );
}
