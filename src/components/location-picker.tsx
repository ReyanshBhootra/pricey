"use client";

// Where you're shopping from: Near me (GPS), a ZIP or neighborhood, or a borough. The choice is
// saved (cookie, and your account's home if you typed a ZIP) so every page uses the same place.
import { LocateFixed, MapPin } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { setWhereAction } from "@/lib/actions";
import { BOROUGHS } from "@/lib/types";
import { cn } from "@/lib/utils";
import { chipClass } from "./chip";

export type PickerWhere = { label: string; kind: "gps" | "place" | "borough" } | null;

// Why the browser couldn't find them, in words they can act on.
const GEO_ERRORS: Record<number, string> = {
  1: "Location is blocked for this site. Click the icon left of the web address, allow Location, and try again. Or type your ZIP.",
  2: "Your device couldn't work out where you are. On Windows, turn on Settings > Privacy & security > Location. Or just type your ZIP.",
  3: "Finding you took too long. Type your ZIP instead.",
};

export function LocationPicker({ where }: { where: PickerWhere }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [status, setStatus] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();

  const save = (input: Parameters<typeof setWhereAction>[0], quiet = false) =>
    start(async () => {
      const r = await setWhereAction(input);
      if (!r.ok) return setStatus(quiet ? null : r.error);
      setStatus(null);
      setText("");
      // Old links carried the place in the URL; the saved place replaces it.
      const next = new URLSearchParams(params);
      ["lat", "lng", "loc", "near"].forEach((k) => next.delete(k));
      router.replace(next.size ? `${path}?${next}` : path, { scroll: false });
      router.refresh();
    });

  const locate = () => {
    if (!navigator.geolocation) return setStatus("This browser can't share location. Type your ZIP instead.");
    setStatus("Finding you...");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => save({ lat: coords.latitude, lng: coords.longitude }),
      (e) => setStatus(GEO_ERRORS[e.code] ?? GEO_ERRORS[2]),
      { timeout: 10000, maximumAge: 10 * 60_000 },
    );
  };

  // First visit with nothing chosen: try once, quietly. If it fails, the ZIP box is right there.
  useEffect(() => {
    if (where) return;
    try {
      if (sessionStorage.getItem("pricey_located")) return;
      sessionStorage.setItem("pricey_located", "1");
    } catch {}
    // Callbacks only, so nothing updates state during the effect itself.
    navigator.geolocation?.getCurrentPosition(({ coords }) => save({ lat: coords.latitude, lng: coords.longitude }, true), () => {}, { timeout: 10000, maximumAge: 10 * 60_000 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mb-4 space-y-2">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <button type="button" onClick={() => locate()} disabled={pending} className={chipClass(where?.kind === "gps")}>
          <LocateFixed className="mr-1.5 size-3.5" />
          Near me
        </button>
        {BOROUGHS.map((b) => (
          <button key={b} type="button" disabled={pending} onClick={() => save({ borough: b })} className={chipClass(where?.kind === "borough" && (where.label === b || (b === "Bronx" && where.label === "the Bronx")))}>
            {b}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save({ text });
        }}
        className="flex max-w-sm gap-2"
      >
        <label className={cn("flex h-9 flex-1 items-center gap-2 rounded-full border bg-card px-3 text-sm", where?.kind === "place" && "border-foreground")}>
          <MapPin className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={where?.kind === "place" ? `Near ${where.label} · change ZIP` : "Your ZIP or neighborhood"}
            aria-label="Your ZIP or neighborhood"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
            inputMode="text"
            maxLength={60}
          />
        </label>
        <button type="submit" disabled={pending || !text.trim()} className={cn(chipClass(false), "h-9 disabled:opacity-50")}>
          {pending ? "..." : "Go"}
        </button>
      </form>
      {status && <p className="text-xs text-muted-foreground">{status}</p>}
    </div>
  );
}
