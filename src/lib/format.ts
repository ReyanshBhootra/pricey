import type { Borough } from "./types";

export const money = (n: number) => (n === 0 ? "Free" : `$${n.toFixed(2)}`);

export function timeAgo(ts: number) {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

// Used when the user skips geolocation or is outside NYC.
export const BOROUGH_CENTERS: Record<Borough, { lat: number; lng: number }> = {
  Manhattan: { lat: 40.7342, lng: -73.9897 },
  Brooklyn: { lat: 40.6934, lng: -73.9636 },
  Queens: { lat: 40.7496, lng: -73.885 },
  Bronx: { lat: 40.8367, lng: -73.8903 },
  "Staten Island": { lat: 40.5795, lng: -74.1502 },
};

export const DEFAULT_LOCATION = BOROUGH_CENTERS.Manhattan;

export const inNyc = (lat: number, lng: number) => lat > 40.49 && lat < 40.92 && lng > -74.27 && lng < -73.68;

// Distances are kept in km internally; people see miles (feet when very close).
export const kmToMiles = (km: number) => km * 0.621371;
export function miles(km: number) {
  const mi = kmToMiles(km);
  if (mi < 0.1) return `${Math.max(50, Math.round((mi * 5280) / 50) * 50)} ft`;
  return `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi`;
}
// About 20 minutes per mile on foot.
export const walkMinutes = (km: number) => Math.max(1, Math.round(kmToMiles(km) * 20));

export const hoursAgo = (h: number) => Date.now() - h * 60 * 60 * 1000;
