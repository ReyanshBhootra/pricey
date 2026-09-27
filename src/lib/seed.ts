import type { ForumPost, Item, Report, Store } from "./types";

// Fake but real-looking NYC data. Used as the in-memory database when Firebase
// is not configured, and pushed to Firestore by `npm run seed`.

export const SEED_STORES: Store[] = [
  { id: "trader-joes-union-sq", name: "Trader Joe's Union Square", borough: "Manhattan", lat: 40.7342, lng: -73.9897 },
  { id: "whole-foods-bryant-park", name: "Whole Foods Bryant Park", borough: "Manhattan", lat: 40.7527, lng: -73.9845 },
  { id: "fairway-upper-west", name: "Fairway Upper West Side", borough: "Manhattan", lat: 40.7836, lng: -73.9807 },
  { id: "c-town-harlem", name: "C-Town Harlem", borough: "Manhattan", lat: 40.8116, lng: -73.9465 },
  { id: "key-food-lower-east", name: "Key Food Lower East Side", borough: "Manhattan", lat: 40.7155, lng: -73.9870 },
  { id: "joe-coffee-chelsea", name: "Joe Coffee Chelsea", borough: "Manhattan", lat: 40.7465, lng: -74.0014 },
  { id: "food-bazaar-williamsburg", name: "Food Bazaar Williamsburg", borough: "Brooklyn", lat: 40.7069, lng: -73.9536 },
  { id: "key-food-park-slope", name: "Key Food Park Slope", borough: "Brooklyn", lat: 40.6734, lng: -73.9790 },
  { id: "trader-joes-downtown-bk", name: "Trader Joe's Downtown Brooklyn", borough: "Brooklyn", lat: 40.6907, lng: -73.9906 },
  { id: "bravo-bed-stuy", name: "Bravo Supermarket Bed-Stuy", borough: "Brooklyn", lat: 40.6872, lng: -73.9418 },
  { id: "bodega-bushwick", name: "Myrtle Deli & Grocery", borough: "Brooklyn", lat: 40.6995, lng: -73.9236 },
  { id: "hmart-flushing", name: "H Mart Flushing", borough: "Queens", lat: 40.7607, lng: -73.8303 },
  { id: "patel-bros-jackson-hts", name: "Patel Brothers Jackson Heights", borough: "Queens", lat: 40.7496, lng: -73.8850 },
  { id: "key-food-astoria", name: "Key Food Astoria", borough: "Queens", lat: 40.7644, lng: -73.9235 },
  { id: "western-beef-ridgewood", name: "Western Beef Ridgewood", borough: "Queens", lat: 40.7057, lng: -73.9044 },
  { id: "food-bazaar-bronx", name: "Food Bazaar Southern Blvd", borough: "Bronx", lat: 40.8190, lng: -73.8927 },
  { id: "fine-fare-fordham", name: "Fine Fare Fordham", borough: "Bronx", lat: 40.8616, lng: -73.8904 },
  { id: "shoprite-staten-island", name: "ShopRite Staten Island", borough: "Staten Island", lat: 40.5795, lng: -74.1502 },
];

export const SEED_ITEMS: Item[] = [
  { id: "eggs-dozen", name: "Eggs (dozen)", category: "dairy" },
  { id: "milk-gallon", name: "Whole milk (gallon)", category: "dairy" },
  { id: "bananas-lb", name: "Bananas (lb)", category: "produce" },
  { id: "potatoes-5lb", name: "Potatoes (5 lb bag)", category: "produce" },
  { id: "avocado", name: "Avocado (each)", category: "produce" },
  { id: "onions-3lb", name: "Onions (3 lb bag)", category: "produce" },
  { id: "chicken-thighs-lb", name: "Chicken thighs (lb)", category: "meat" },
  { id: "ground-beef-lb", name: "Ground beef (lb)", category: "meat" },
  { id: "bread-loaf", name: "Sliced bread (loaf)", category: "bakery" },
  { id: "rice-5lb", name: "Rice (5 lb)", category: "pantry" },
  { id: "pasta-1lb", name: "Pasta (1 lb)", category: "pantry" },
  { id: "black-beans-can", name: "Black beans (can)", category: "pantry" },
  { id: "coffee-drip-small", name: "Drip coffee (small)", category: "coffee" },
  { id: "latte-12oz", name: "Latte (12 oz)", category: "coffee" },
  { id: "bacon-egg-cheese", name: "Bacon egg and cheese", category: "prepared food" },
  { id: "chicken-over-rice", name: "Chicken over rice", category: "prepared food" },
];

// Deterministic pseudo-random so every teammate sees the same seed.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const BASE_PRICE: Record<string, number> = {
  "eggs-dozen": 4.29, "milk-gallon": 4.49, "bananas-lb": 0.69, "potatoes-5lb": 4.99,
  "avocado": 1.79, "onions-3lb": 3.49, "chicken-thighs-lb": 3.99, "ground-beef-lb": 6.49,
  "bread-loaf": 3.29, "rice-5lb": 6.99, "pasta-1lb": 1.79, "black-beans-can": 1.19,
  "coffee-drip-small": 2.5, "latte-12oz": 5.25, "bacon-egg-cheese": 5.5, "chicken-over-rice": 9,
};

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// How much each item's price moved over the last ~6 weeks (0.18 = up 18%).
const TREND: Record<string, number> = {
  "eggs-dozen": 0.18, "milk-gallon": 0.04, "bananas-lb": -0.03, "avocado": -0.08, "chicken-thighs-lb": 0.06,
  "ground-beef-lb": 0.09, "coffee-drip-small": 0.05, "latte-12oz": 0.03, "rice-5lb": 0.02, "bread-loaf": 0.03,
};

function buildReports(): Report[] {
  const rand = rng(42);
  const now = Date.now();
  const reports: Report[] = [];
  let n = 0;
  const add = (r: Omit<Report, "id">) => reports.push({ ...r, id: `seed-${++n}` });

  for (const store of SEED_STORES) {
    const isCafe = store.id.includes("coffee");
    const isBodega = store.id.includes("bodega");
    const markup = store.borough === "Manhattan" ? 1.15 : 1;
    for (const item of SEED_ITEMS) {
      const cafeItem = item.category === "coffee" || item.category === "prepared food";
      if (isCafe && !cafeItem) continue;
      if (!isCafe && !isBodega && item.category === "coffee" && rand() < 0.6) continue;
      if (rand() < 0.35) continue; // not every store has every item reported
      if (store.id === "shoprite-staten-island" && item.id === "potatoes-5lb") continue; // demo case below

      const price = Math.round(BASE_PRICE[item.id] * markup * (0.85 + rand() * 0.3) * 100) / 100;
      // Price history: the same store's price drifted over the last ~6 weeks by the item's trend
      // (eggs up ~18%, avocados down, and so on). priceAt(0) is today's price.
      const trend = TREND[item.id] ?? 0;
      const priceAt = (daysAgo: number) => Math.round((price / (1 + trend)) * (1 + trend * (1 - Math.min(daysAgo, 40) / 40)) * 100) / 100;
      // Distinct people per round, since vouching counts one vote per person.
      let user = Math.floor(rand() * 40);
      // Everyone in a round saw the same shelf price.
      const round = (daysAgo: number, voters: number, spreadHours: number) => {
        for (let v = 0; v < voters; v++) {
          const ts = now - daysAgo * DAY - Math.floor(rand() * spreadHours) * HOUR;
          add({ itemId: item.id, storeId: store.id, price: priceAt(daysAgo), timestamp: ts, userId: `seed-user-${user++}`, type: "price" });
        }
      };
      round(35 + Math.floor(rand() * 7), 1 + Math.floor(rand() * 2), 24); // about 5 to 6 weeks ago
      round(14 + Math.floor(rand() * 10), 1 + Math.floor(rand() * 2), 24); // 2 to 3 weeks ago
      // Most prices were confirmed in the last 3 days; about 1 in 5 not for over a week (stale).
      const stale = rand() < 0.2;
      const recent = 2 + Math.floor(rand() * 3);
      if (stale) round(8 + Math.floor(rand() * 5), recent, 24);
      else round(0, recent, 72);
      if (!stale && rand() < 0.25) {
        // One outlier so vouching has something to beat.
        add({ itemId: item.id, storeId: store.id, price: Math.round(price * 0.7 * 100) / 100, timestamp: now - Math.floor(rand() * 72) * HOUR, userId: `seed-user-${user++}`, type: "price" });
      }
    }
  }

  // The demo case from the brief: 10 people say $10, 2 say $7, the app shows $10.
  for (let i = 0; i < 10; i++) {
    add({ itemId: "potatoes-5lb", storeId: "shoprite-staten-island", price: 10, timestamp: now - i * HOUR, userId: `demo-${i}`, type: "price" });
  }
  for (let i = 0; i < 2; i++) {
    add({ itemId: "potatoes-5lb", storeId: "shoprite-staten-island", price: 7, timestamp: now - i * HOUR, userId: `demo-liar-${i}`, type: "price" });
  }

  // Free food and pop-ups (Person D). price 0 means free.
  const events: [string, string, number, string][] = [
    ["bacon-egg-cheese", "bodega-bushwick", 0, "Free BEC with any coffee until 11am"],
    ["coffee-drip-small", "joe-coffee-chelsea", 1, "$1 drip coffee pop-up today"],
    ["bread-loaf", "key-food-park-slope", 0, "Day-old bread free at the register"],
    ["chicken-over-rice", "c-town-harlem", 5, "Halal cart outside doing $5 plates"],
    ["bananas-lb", "food-bazaar-bronx", 0.29, "Bananas 29 cents, today only"],
  ];
  for (const [itemId, storeId, price, note] of events) {
    add({ itemId, storeId, price, note, timestamp: now - Math.floor(rand() * 4) * HOUR, userId: "seed-events", type: "event" });
  }

  return reports;
}

export const SEED_REPORTS: Report[] = buildReports();

export const SEED_FORUM_POSTS: ForumPost[] = [
  { id: "post-1", borough: "Brooklyn", text: "Food Bazaar on Broadway has avocados 3 for $4 this week.", timestamp: Date.now() - 2 * HOUR, userId: "seed-user-3" },
  { id: "post-2", borough: "Manhattan", text: "Trader Joe's Union Sq line is 20 min right now, go to the Chelsea one.", timestamp: Date.now() - 5 * HOUR, userId: "seed-user-8" },
  { id: "post-3", borough: "Queens", text: "Patel Brothers rice 20 lb bags are the best deal in the city, not close.", timestamp: Date.now() - 9 * HOUR, userId: "seed-user-11" },
  { id: "post-4", borough: "Bronx", text: "Anyone know if the Fordham greenmarket takes EBT?", timestamp: Date.now() - 20 * HOUR, userId: "seed-user-17" },
  { id: "post-5", borough: "Staten Island", text: "ShopRite potatoes jumped to $10 a bag??", timestamp: Date.now() - 1 * HOUR, userId: "seed-user-21" },
];
