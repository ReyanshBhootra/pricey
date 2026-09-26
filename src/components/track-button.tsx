"use client";

import { Bell, BellRing } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { syncListsAction } from "@/lib/actions";
import { signedIn } from "./account-sync";

// Tracked items live in this browser only. Alerts show on the Nearby page,
// and as a browser notification when permission is granted.
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
    let list: string[] = [];
    try {
      list = JSON.parse(read());
    } catch {}
    list = list.filter((id) => id !== itemId);
    if (!tracked) {
      list.push(itemId);
      if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
    }
    try {
      localStorage.setItem(TRACK_KEY, JSON.stringify(list));
    } catch {}
    window.dispatchEvent(new Event(EVENT));
    if (signedIn()) void syncListsAction({ tracked: list });
  };

  return (
    <Button variant={tracked ? "secondary" : "outline"} size="sm" onClick={toggle} className="rounded-full">
      {tracked ? <BellRing className="text-primary" /> : <Bell />}
      {tracked ? "Tracking price" : "Track price"}
    </Button>
  );
}
