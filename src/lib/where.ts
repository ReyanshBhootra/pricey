// Where the person is shopping from, shared by every page: Nearby, the map, the shopping list,
// and Ask. Set once (Near me, a ZIP or neighborhood, or a borough) and remembered in a cookie.
// Logged-in people fall back to the home saved on their account. Server only.
import { cookies } from "next/headers";
import { getUser } from "./data";
import { BOROUGH_PLACES } from "./places";
import { sessionUserId } from "./session";
import { BOROUGHS, type Borough } from "./types";
import { inNyc } from "./format";

export const WHERE_COOKIE = "pricey_where";

export interface Where {
  lat: number;
  lng: number;
  label: string; // "you", "11215", "Park Slope", "Manhattan"
  borough: Borough;
  kind: "gps" | "place" | "borough";
}

export const isExact = (w: Where) => w.kind !== "borough";

// "near you", "near 11215", "in Manhattan"
export const nearText = (w: Where) => (w.kind === "gps" ? "near you" : w.kind === "place" ? `near ${w.label}` : `in ${w.label}`);

export function parseWhere(raw: string | undefined): Where | null {
  if (!raw) return null;
  try {
    const w = JSON.parse(raw) as Where;
    if (!inNyc(w.lat, w.lng) || !BOROUGHS.includes(w.borough) || !["gps", "place", "borough"].includes(w.kind) || typeof w.label !== "string") return null;
    return { lat: w.lat, lng: w.lng, label: w.label.slice(0, 40), borough: w.borough, kind: w.kind };
  } catch {
    return null;
  }
}

export async function getWhere(): Promise<Where | null> {
  const saved = parseWhere((await cookies()).get(WHERE_COOKIE)?.value);
  if (saved) return saved;
  const id = await sessionUserId();
  const home = id ? (await getUser(id))?.home : undefined;
  if (home) return { lat: home.lat, lng: home.lng, label: home.label, borough: home.borough, kind: home.approximate ? "borough" : "place" };
  return null;
}

// Nothing chosen yet: Manhattan, clearly labeled as a borough (no made-up walking times).
export const DEFAULT_WHERE: Where = { ...BOROUGH_PLACES.Manhattan, kind: "borough" };
