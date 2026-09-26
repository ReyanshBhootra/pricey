"use client";

import { useEffect } from "react";

// Logged in: bring the account's tracked items and starred stores onto this device, so alerts
// and the map's Favorites work everywhere you log in.
export function AccountSync({ tracked, favorites }: { tracked: string[]; favorites: string[] }) {
  useEffect(() => {
    const merge = (key: string, add: string[], event: string) => {
      try {
        const mine: string[] = JSON.parse(localStorage.getItem(key) ?? "[]");
        const next = [...new Set([...mine, ...add])];
        if (next.length !== mine.length) {
          localStorage.setItem(key, JSON.stringify(next));
          window.dispatchEvent(new Event(event));
        }
      } catch {}
    };
    merge("pricey_tracked", tracked, "pricey-tracked-change");
    merge("pricey_favorites", favorites, "pricey-favorites-change");
  }, [tracked, favorites]);
  return null;
}

export const signedIn = () => typeof document !== "undefined" && /(?:^|;\s*)pricey_signed_in=1/.test(document.cookie);
