"use client";

// "Use my location" for pages that take lat/lng in the URL.
import { LocateFixed } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { inNyc } from "@/lib/format";
import { Button } from "@/components/ui/button";

export function LocateButton() {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [status, setStatus] = useState<string | null>(null);

  const locate = () => {
    if (!navigator.geolocation) return setStatus("Location isn't available in this browser.");
    setStatus("Finding you...");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!inNyc(coords.latitude, coords.longitude)) return setStatus("You look to be outside NYC, so type a ZIP instead.");
        const next = new URLSearchParams(params);
        next.set("lat", coords.latitude.toFixed(4));
        next.set("lng", coords.longitude.toFixed(4));
        next.set("loc", "You");
        next.delete("near");
        setStatus(null);
        router.replace(`${path}?${next}`, { scroll: false });
      },
      () => setStatus("Location blocked, so type a ZIP instead."),
      { timeout: 8000 },
    );
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={locate}>
        <LocateFixed /> Use my location
      </Button>
      {status && <span className="text-xs text-muted-foreground">{status}</span>}
    </span>
  );
}
