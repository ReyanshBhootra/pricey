"use client";

import { useSyncExternalStore } from "react";

// Tracked items live in this browser only. Alerts show on the Nearby page.
const TRACK_KEY = "pricey_tracked";
const EVENT = "pricey-tracked-change";

function read(): string {
  try {
    return localStorage.getItem(TRACK_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

// Returns the tracked item ids, or null during server render.
export function useTracked(): string[] | null {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function TrackButton({ itemId }: { itemId: string }) {
  const tracked = useTracked()?.includes(itemId) ?? false;

  const toggle = () => {
    const list = (JSON.parse(read()) as string[]).filter((id) => id !== itemId);
    if (!tracked) list.push(itemId);
    try {
      localStorage.setItem(TRACK_KEY, JSON.stringify(list));
    } catch {}
    window.dispatchEvent(new Event(EVENT));
  };

  return (
    <button
      onClick={toggle}
      className={`rounded-full border px-3 py-1.5 text-sm ${tracked ? "border-accent bg-accent-soft text-accent" : "border-line bg-card"}`}
    >
      {tracked ? "Tracking price" : "Track price"}
    </button>
  );
}
