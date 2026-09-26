"use client";

import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getDb } from "@/lib/firebase";

// Re-renders the page when new data lands, so reports from other people show up live.
// Firestore: listens for new docs in `name` (optionally only where field == value).
// Seed mode: re-fetches every 20 seconds.
export function LiveRefresh({ name, field, value }: { name: "reports" | "forumPosts"; field?: string; value?: string }) {
  const router = useRouter();

  useEffect(() => {
    const db = getDb();
    if (!db) {
      const id = setInterval(() => router.refresh(), 20000);
      return () => clearInterval(id);
    }
    // Only a timestamp filter, so no composite index is needed. The field match happens here.
    const since = Date.now() - 5000;
    return onSnapshot(query(collection(db, name), where("timestamp", ">", since)), (snap) => {
      const fresh = snap.docChanges().some((c) => c.type === "added" && (!field || c.doc.get(field) === value));
      if (fresh) router.refresh();
    });
  }, [router, name, field, value]);

  return null;
}
