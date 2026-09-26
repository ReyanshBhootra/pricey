import { getApp, getApps, initializeApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseEnabled = Boolean(config.apiKey && config.projectId);

let db: Firestore | null = null;

// Returns null when Firebase env vars are missing, so the app runs on seed data.
export function getDb(): Firestore | null {
  if (!firebaseEnabled) return null;
  if (!db) {
    const app = getApps().length ? getApp() : initializeApp(config);
    db = getFirestore(app);
  }
  return db;
}

export const COLLECTIONS = {
  stores: "stores",
  items: "items",
  reports: "reports",
  forumPosts: "forumPosts",
  priceChanges: "priceChanges",
} as const;
