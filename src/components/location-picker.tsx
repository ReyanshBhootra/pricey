"use client";

import { LocateFixed } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BOROUGH_CENTERS, inNyc } from "@/lib/format";
import { BOROUGHS } from "@/lib/types";
import { chipClass } from "./chip";

export function LocationPicker({ label }: { label: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = useState<string | null>(null);

  const go = (lat: number, lng: number, loc: string) => {
    const next = new URLSearchParams(params);
    next.set("lat", lat.toFixed(4));
    next.set("lng", lng.toFixed(4));
    next.set("loc", loc);
    router.replace(`/?${next}`, { scroll: false });
  };

  // Callbacks only, so it is safe to start from an effect.
  const request = () =>
    navigator.geolocation?.getCurrentPosition(
      ({ coords }) => {
        if (inNyc(coords.latitude, coords.longitude)) {
          setStatus(null);
          go(coords.latitude, coords.longitude, "You");
        } else {
          setStatus("You look to be outside NYC, so pick a borough.");
        }
      },
      () => setStatus("Location blocked, so pick a borough."),
      { timeout: 8000 },
    );

  const locate = () => {
    if (!navigator.geolocation) return setStatus("Location is not available in this browser.");
    setStatus("Finding you...");
    request();
  };

  // Ask once per visit when no location is in the URL yet.
  useEffect(() => {
    if (params.get("lat")) return;
    try {
      if (sessionStorage.getItem("pricey_located")) return;
      sessionStorage.setItem("pricey_located", "1");
    } catch {}
    request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mb-4">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <button onClick={locate} className={chipClass(label === "You")}>
          <LocateFixed className="mr-1.5 size-3.5" />
          Near me
        </button>
        {BOROUGHS.map((b) => (
          <button key={b} onClick={() => go(BOROUGH_CENTERS[b].lat, BOROUGH_CENTERS[b].lng, b)} className={chipClass(label === b)}>
            {b}
          </button>
        ))}
      </div>
      {status && <p className="mt-2 text-xs text-muted-foreground">{status}</p>}
    </div>
  );
}
