"use client";

import { Button } from "@/components/ui/button";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="py-16 text-center">
      <h1 className="mb-2 text-[2.6rem] leading-[0.95]">Something went wrong</h1>
      <p className="mb-6 text-sm text-muted-foreground">Could not load prices. Check your connection and try again.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
