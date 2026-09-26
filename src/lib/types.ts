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
}

// Firestore collection: "forumPosts"
export interface ForumPost {
  id: string;
  borough: Borough;
  text: string;
  timestamp: number;
  userId: string;
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
