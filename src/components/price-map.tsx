"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import { Beef, Carrot, Coffee, Croissant, Flame, Heart, LocateFixed, Milk, Navigation, Package, Sandwich, Sparkles, Tag, Users, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Map as MapboxMap, Marker } from "mapbox-gl";
import { Button } from "@/components/ui/button";
import { syncListsAction } from "@/lib/actions";
import { signedIn } from "./account-sync";
import { miles } from "@/lib/format";
import type { MapStore } from "@/lib/map-data";
import type { Category } from "@/lib/types";
import { cn } from "@/lib/utils";

// Public Mapbox token (starts with pk.), set as NEXT_PUBLIC_MAPBOX_TOKEN in Vercel and .env.local.
const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

type Filter = "all" | "cheapest" | "deals" | "trending" | "popular" | "favorites" | Category;

const FILTERS: { id: Filter; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "cheapest", label: "Cheapest", icon: Tag },
  { id: "deals", label: "Deals now", icon: Sparkles },
  { id: "trending", label: "Trending", icon: Flame },
  { id: "popular", label: "Popular", icon: Users },
  { id: "favorites", label: "Favorites", icon: Heart },
  { id: "produce", label: "Produce", icon: Carrot },
  { id: "dairy", label: "Dairy", icon: Milk },
  { id: "meat", label: "Meat", icon: Beef },
  { id: "bakery", label: "Bakery", icon: Croissant },
  { id: "pantry", label: "Pantry", icon: Package },
  { id: "coffee", label: "Coffee", icon: Coffee },
  { id: "prepared food", label: "Prepared food", icon: Sandwich },
];

// Starred stores live in this browser (and sync to your profile once you're logged in).
const FAV_KEY = "pricey_favorites";
const FAV_EVENT = "pricey-favorites-change";
const readFavs = () => {
  try {
    return localStorage.getItem(FAV_KEY) ?? "[]";
  } catch {
    return "[]";
  }
};
const subscribeFavs = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener(FAV_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(FAV_EVENT, cb);
  };
};
function useFavorites(): [string[], (id: string) => void] {
  const raw = useSyncExternalStore(subscribeFavs, readFavs, () => "[]");
  const list = useMemo<string[]>(() => {
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }, [raw]);
  const toggle = (id: string) => {
    const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify(next));
    } catch {}
    window.dispatchEvent(new Event(FAV_EVENT));
    if (signedIn()) void syncListsAction({ favorites: next });
  };
  return [list, toggle];
}

type Glow = "cheap" | "deal" | "hot" | "star" | null;

// For the current filter: is this store highlighted, what glow, and what label under its name.
function describe(s: MapStore, filter: Filter, ranks: { cheap: Set<string>; hot: Set<string>; popular: Set<string> }, favs: string[]) {
  switch (filter) {
    case "all":
      if (s.deals.length) return { on: true, glow: "deal" as Glow, label: s.deals[0] };
      if (ranks.cheap.has(s.id)) return { on: true, glow: "cheap" as Glow, label: `${Math.abs(s.valueVsCity!)}% below avg` };
      return { on: true, glow: null, label: s.prices[0] ? `${s.prices[0].item.split(" (")[0]} ${s.prices[0].price}` : "" };
    case "cheapest":
      return s.valueVsCity === null
        ? { on: false, glow: null, label: "" }
        : { on: ranks.cheap.has(s.id), glow: ranks.cheap.has(s.id) ? ("cheap" as Glow) : null, label: s.valueVsCity < 0 ? `${-s.valueVsCity}% below avg` : `${s.valueVsCity}% above avg` };
    case "deals":
      return { on: s.deals.length > 0, glow: s.deals.length ? ("deal" as Glow) : null, label: s.deals[0] ?? "" };
    case "trending":
      return { on: ranks.hot.has(s.id), glow: ranks.hot.has(s.id) ? ("hot" as Glow) : null, label: s.reportsToday ? `${s.reportsToday} reports today` : "" };
    case "popular":
      return { on: ranks.popular.has(s.id), glow: ranks.popular.has(s.id) ? ("hot" as Glow) : null, label: `${s.reporters} people report here` };
    case "favorites":
      return { on: favs.includes(s.id), glow: favs.includes(s.id) ? ("star" as Glow) : null, label: favs.includes(s.id) ? "Favorite" : "" };
    default: {
      const label = s.byCategory[filter];
      return { on: Boolean(label), glow: null, label: label ?? "" };
    }
  }
}

const GLOW_COLOR: Record<Exclude<Glow, null>, string> = { cheap: "#22c55e", deal: "#f97316", hot: "#e11d48", star: "#eab308" };

export function PriceMap({ stores, center, you }: { stores: MapStore[]; center: { lat: number; lng: number }; you: { lat: number; lng: number } | null }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MapboxMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const lastFramed = useRef<Filter>("all");
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [favs, toggleFav] = useFavorites();

  const ranks = useMemo(() => {
    const top = (score: (s: MapStore) => number, n: number) =>
      new Set(stores.filter((s) => score(s) > 0).sort((a, b) => score(b) - score(a)).slice(0, n).map((s) => s.id));
    return {
      cheap: top((s) => (s.valueVsCity !== null && s.valueVsCity < 0 ? -s.valueVsCity : 0), 5),
      hot: top((s) => s.reportsToday, 5),
      popular: top((s) => s.reporters, 5),
    };
  }, [stores]);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    if (!TOKEN) return;
    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled || !box.current) return;
      mapboxgl.accessToken = TOKEN;
      const dark = document.documentElement.classList.contains("dark") || window.matchMedia("(prefers-color-scheme: dark)").matches;
      const m = new mapboxgl.Map({
        container: box.current,
        style: dark ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/light-v11",
        center: [center.lng, center.lat],
        zoom: 12.3,
        attributionControl: false,
      });
      m.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-left");
      m.on("error", (e) => {
        if (!m.isStyleLoaded()) setFailed(true);
        console.warn("Map:", e.error?.message);
      });
      m.on("load", () => {
        // Soft glows under highlighted stores, like the Snap Map heat.
        m.addSource("glow", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addLayer({
          id: "glow",
          type: "circle",
          source: "glow",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 22, 14, 70],
            "circle-color": ["get", "color"],
            "circle-blur": 1,
            "circle-opacity": 0.7,
          },
        });
        if (you) {
          const dot = document.createElement("div");
          dot.className = "pricey-you";
          dot.setAttribute("aria-label", "You are here");
          new mapboxgl.Marker({ element: dot }).setLngLat([you.lng, you.lat]).addTo(m);
        }
        setReady(true);
      });
      m.on("click", (e) => {
        if ((e.originalEvent.target as HTMLElement).closest(".pricey-pin")) return;
        setSelected(null);
      });
      map.current = m;
    })().catch(() => setFailed(true));
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // The map is created once; center changes move it below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    map.current?.flyTo({ center: [center.lng, center.lat], zoom: 12.3, duration: 800 });
  }, [center.lat, center.lng]);

  // Redraw pins and glows whenever the filter, favorites, or selection change.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    let cancelled = false;
    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled) return;
      markers.current.forEach((mk) => mk.remove());
      const features: { type: "Feature"; geometry: { type: "Point"; coordinates: [number, number] }; properties: { color: string } }[] = [];
      markers.current = stores.map((s) => {
        const d = describe(s, filter, ranks, favs);
        if (d.glow) features.push({ type: "Feature", geometry: { type: "Point", coordinates: [s.lng, s.lat] }, properties: { color: GLOW_COLOR[d.glow] } });
        const el = document.createElement("button");
        el.type = "button";
        el.className = cn("pricey-pin", !d.on && "pricey-pin-dim", selected === s.id && "pricey-pin-selected");
        el.setAttribute("aria-label", s.name);
        const initials = s.name.split(/\s+/).filter((w) => /^[A-Z]/.test(w)).slice(0, 2).map((w) => w[0]).join("");
        el.innerHTML = `<span class="pricey-pin-avatar" style="${d.glow ? `border-color:${GLOW_COLOR[d.glow]}` : ""}">${initials}</span><span class="pricey-pin-label"><b></b><i></i></span>`;
        el.querySelector("b")!.textContent = s.name;
        el.querySelector("i")!.textContent = d.on ? d.label : "";
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          setSelected(s.id);
          m.easeTo({ center: [s.lng, s.lat], duration: 500 });
        });
        return new mapboxgl.Marker({ element: el, anchor: "top" }).setLngLat([s.lng, s.lat]).addTo(m);
      });
      (m.getSource("glow") as mapboxgl.GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features });
      // A new filter: frame the stores it highlights (and you), like Snap Map jumping to what you picked.
      if (filter !== lastFramed.current) {
        lastFramed.current = filter;
        const lit = filter === "all" ? [] : stores.filter((s) => describe(s, filter, ranks, favs).on);
        if (lit.length) {
          const bounds = new mapboxgl.LngLatBounds();
          lit.forEach((s) => bounds.extend([s.lng, s.lat]));
          if (you) bounds.extend([you.lng, you.lat]);
          m.fitBounds(bounds, { padding: { top: 80, bottom: 60, left: 50, right: 50 }, maxZoom: 14, duration: 700 });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, stores, filter, favs, selected, ranks, you]);

  const store = stores.find((s) => s.id === selected) ?? null;
  const d = store ? describe(store, filter, ranks, favs) : null;

  return (
    <div className="relative -mx-4 h-[70vh] min-h-[440px] overflow-hidden border-y sm:mx-0 sm:rounded-2xl sm:border">
      {/* Mapbox's stylesheet makes its container position: relative, so size it through a wrapper. */}
      <div className="absolute inset-0 bg-muted">
        <div ref={box} className="h-full w-full" data-testid="map" />
      </div>
      {!TOKEN && (
        <div className="absolute inset-0 grid place-items-center bg-muted p-6 text-center text-sm text-muted-foreground">
          The map isn&apos;t set up yet (NEXT_PUBLIC_MAPBOX_TOKEN is missing). Switch to List to see the same stores.
        </div>
      )}
      {failed && (
        <div className="absolute inset-0 grid place-items-center bg-muted p-6 text-center text-sm text-muted-foreground">
          The map couldn&apos;t load right now. Switch to List to see the same stores.
        </div>
      )}

      {/* Filter chips, Snap Map style */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex gap-2 overflow-x-auto p-3 [scrollbar-width:none]">
        {FILTERS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(filter === id ? "all" : id)}
            aria-pressed={filter === id}
            className={cn(
              "pointer-events-auto inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium shadow-md backdrop-blur transition-colors",
              filter === id ? "bg-foreground text-background" : "bg-background/85 text-foreground hover:bg-background",
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {you && (
        <button
          type="button"
          onClick={() => map.current?.flyTo({ center: [you.lng, you.lat], zoom: 14, duration: 700 })}
          className="absolute right-3 bottom-4 grid size-11 place-items-center rounded-full bg-background/90 shadow-md backdrop-blur"
          aria-label="Center on me"
          style={{ bottom: store ? "13.5rem" : undefined }}
        >
          <LocateFixed className="size-5" />
        </button>
      )}

      {/* Store card */}
      {store && d && (
        <div className="absolute inset-x-3 bottom-3 rounded-2xl border bg-background/95 p-4 shadow-xl backdrop-blur">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-semibold">{store.name}</p>
              <p className="text-xs text-muted-foreground">
                {store.borough}
                {store.distanceKm !== null && ` · ${miles(store.distanceKm)} away`}
                {store.valueVsCity !== null && ` · ${store.valueVsCity <= 0 ? `${-store.valueVsCity}% below` : `${store.valueVsCity}% above`} city avg`}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <button type="button" onClick={() => toggleFav(store.id)} className="grid size-8 place-items-center rounded-full hover:bg-accent" aria-label={favs.includes(store.id) ? "Remove favorite" : "Add favorite"}>
                <Heart className={cn("size-4", favs.includes(store.id) && "fill-yellow-500 text-yellow-500")} />
              </button>
              <button type="button" onClick={() => setSelected(null)} className="grid size-8 place-items-center rounded-full hover:bg-accent" aria-label="Close">
                <X className="size-4" />
              </button>
            </div>
          </div>
          {store.deals.length > 0 && (
            <p className="mb-2 rounded-lg bg-brand-soft px-2.5 py-1.5 text-sm">
              <Sparkles className="mr-1 inline size-3.5 text-primary" />
              {store.deals[0]}
            </p>
          )}
          <ul className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {store.prices.slice(0, 4).map((p) => (
              <li key={p.item} className="flex justify-between gap-2">
                <span className="truncate text-muted-foreground">{p.item.split(" (")[0]}</span>
                <span className="font-semibold tabular-nums">{p.price}</span>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button asChild size="sm" className="flex-1">
              <Link href={`/store/${store.id}`}>All prices</Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="flex-1">
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lng}`} target="_blank" rel="noreferrer">
                <Navigation /> Directions
              </a>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
