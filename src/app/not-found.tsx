import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="mb-2 text-[2.6rem] leading-[0.95]">Not found</h1>
      <p className="mb-6 text-sm text-muted-foreground">That item or store is not in Pricey yet.</p>
      <Button asChild>
        <Link href="/report">Add it with a price report</Link>
      </Button>
    </div>
  );
}
