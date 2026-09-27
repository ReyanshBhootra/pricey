// LOCKED SCHEMA. Everyone (app, chatbot, Photon) reads and writes these shapes.
// Change only with the whole team's agreement.

export const BOROUGHS = [
  "Manhattan",
  "Brooklyn",
  "Queens",
  "Bronx",
  "Staten Island",
] as const;
export type Borough = (typeof BOROUGHS)[number];

export const CATEGORIES = [
  "produce",
  "dairy",
  "meat",
  "bakery",
  "pantry",
  "coffee",
  "prepared food",
] as const;
export type Category = (typeof CATEGORIES)[number];

// Firestore collection: "stores"
export interface Store {
  id: string;
  name: string;
  borough: Borough;
  lat: number;
  lng: number;
  address?: string; // imported stores only
  sourceUrl?: string; // where imported prices came from
}

// Firestore collection: "items"
export interface Item {
  id: string;
  name: string;
  category: Category;
}

// Firestore collection: "reports"
// type "price": someone saw this item at this store for this price.
// type "event": free food or pop-up discount. price is 0 for free, note says what it is.
export type ReportType = "price" | "event";

export interface Report {
  id: string;
  itemId: string;
  storeId: string;
  price: number; // USD, e.g. 3.49
  timestamp: number; // ms since epoch (Date.now())
  userId: string; // anon id, phone hash for Photon, etc.
  type: ReportType;
  note?: string; // optional, mainly for events ("free bagels until 5pm")
  sourceUrl?: string; // imported prices: the page the price was read from
}

// Firestore collection: "forumPosts"
export interface ForumPost {
  id: string;
  borough: Borough;
  text: string;
  timestamp: number;
  userId: string;
}

// Firestore collection: "priceChanges" (written by submitReport, read for alerts)
export interface PriceChange {
  id: string;
  itemId: string;
  storeId: string;
  oldPrice: number;
  newPrice: number;
  timestamp: number;
}

// What you send to submitReport. id and timestamp are filled in for you.
export type NewReport = Omit<Report, "id" | "timestamp">;
export type NewForumPost = Omit<ForumPost, "id" | "timestamp">;

// Derived, never stored: the vouched price for one item at one store.
export interface TrustedPrice {
  itemId: string;
  storeId: string;
  price: number;
  votes: number; // reports agreeing on this price
  totalReports: number;
  lastReportedAt: number;
}

export interface SubmitResult {
  report: Report;
  priceChanged: boolean;
  oldPrice: number | null;
  newPrice: number | null;
}

// Firestore collection: "users". One per person, keyed by a one-way hash of their phone
// (the same id whether they text Pricey or log in on the website).
export interface UserHome {
  label: string; // "11215", "Park Slope", or a borough
  lat: number;
  lng: number;
  borough: Borough;
  approximate?: boolean; // only a borough: fine for ranking, too vague for distances
}

export interface ChatTurn {
  role: "user" | "pricey";
  text: string;
  at: number;
}

export type PendingAction =
  | { kind: "receipt"; storeId: string | null; storeName: string; lines: { name: string; price: number; itemId: string | null; category: Category; raw: string }[]; at: number }
  | { kind: "checkin"; itemId: string; storeId: string; price: number; at: number };

export interface UserProfile {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phoneLast4?: string;
  home?: UserHome;
  welcomedAt?: number;
  tracked?: string[]; // item ids
  favorites?: string[]; // store ids
  alerts?: { area: Borough | "all"; since: number } | null;
  spaceId?: string; // iMessage conversation, so Pricey can text them first (alerts, check-ins)
  recent?: ChatTurn[]; // last few messages, for follow-ups
  sentAt?: number[]; // when their last messages arrived, for the rate limit
  pending?: PendingAction | null;
  lastAlertAt?: number;
  lastChangeSeenAt?: number;
  lastCheckinAt?: number;
  createdAt?: number;
  updatedAt?: number;
}
