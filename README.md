# Pricey

Real grocery and food prices across NYC, reported by New Yorkers and trusted through vouching.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm run smoke    # checks the core loop: read, vouch, submit
```

No setup needed to start. Without Firebase env vars the app runs on an in-memory copy of the seed data (18 stores, 16 items, ~500 reports, 5 free food events, 5 forum posts). Writes last until the server restarts.

To switch to Firestore, copy `.env.example` to `.env.local`, fill in the Firebase web config, then run `npm run seed` once. Nothing else changes; every function in `src/lib/data.ts` picks it up automatically.

## Hour 0 decisions (locked)

- **Schema:** `src/lib/types.ts`. Store, Item, Report, ForumPost, exactly as in the brief. One addition: Report has an optional `note` for events ("free bagels until 5pm").
- **Nearby view:** plain list, sorted by distance. Mapbox is a stretch goal only if the core loop is done.
- **Timestamps:** milliseconds since epoch (`Date.now()`), everywhere.
- **Prices:** dollars as a number (`3.49`), rounded to cents on write.
- **Events:** a Report with `type: "event"`. `price: 0` means free.
- **Vouching:** the price the most reports agree on wins. Two-way tie goes to the more recent price, three or more to the median. Logic lives in `src/lib/vouch.ts`.

## The shared data API (`src/lib/data.ts`)

Everyone imports from here. Do not talk to Firestore directly.

| Function | Returns |
| --- | --- |
| `getStores()` / `getItems()` | everything |
| `getNearbyStores(lat, lng, radiusKm = 3)` | stores closest first, with `distanceKm` |
| `getPricesForItem(itemId)` | trusted price per store, cheapest first |
| `getStorePrices(storeId, category?)` | trusted price per item at one store |
| `getPricesForStores(storeIds, category?)` | same, for many stores in one call |
| `getPriceChanges({ hours, itemIds })` | recent trusted price moves, for alerts |
| `getReportsForStore(storeId)` | raw reports, newest first |
| `getActiveEvents({ hours, lat, lng, radiusKm })` | free food and pop-ups, newest first |
| `getForumPosts(borough)` | posts, newest first |
| `submitReport({ itemId, storeId, price, userId, type, note? })` | `{ report, priceChanged, oldPrice, newPrice }` |
| `createForumPost({ borough, text, userId })` | the saved post |

`priceChanged` is true when a new report moves the trusted price. Each move is also saved to the `priceChanges` collection, which is what the Nearby page reads to alert people about items they track.

## Screens (A + B, done)

- `/` Nearby: asks for location (falls back to a borough outside NYC), category filter, deals banner, alerts for tracked items.
- `/item/[id]`: trusted price at every store, cheapest first, with a Track button.
- `/report`: submit a price and watch the list below update, with your store highlighted.
- `/forum`: borough tabs, post and read.

Tracked items are kept in the browser (no login). userId is an anonymous cookie.

## Who owns what

- **A, backend:** Firebase project and config, `src/lib/firebase.ts`, `src/lib/data.ts`, `src/lib/vouch.ts`, seed data, price change alerts.
- **B, frontend:** nearby list, report form, category filter, borough forum, Vercel deploy. Replace `src/app/page.tsx`. shadcn: run `npx shadcn@latest init` on your machine (the registry was not reachable from the setup sandbox).
- **C, Gemini:** `/chat` page and `src/app/api/chat/route.ts`, receipt scanning into `submitReport`. `GEMINI_API_KEY` stays server side.
- **D, Photon:** `src/app/api/photon/route.ts` webhook, text parsing into `submitReport`, batched alerts from `getActiveEvents`.

Put your own code in your own folders so merges stay boring. Pull `main` often.

## Rule of the day

Core loop first: report a price, vouching updates the trusted price, look it up. Everything else sits on top. If something is not working near the end, cut it.
