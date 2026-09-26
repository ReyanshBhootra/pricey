# Pricey

Real grocery and food prices across NYC, reported by New Yorkers and trusted through vouching.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm run smoke    # checks the core loop: read, vouch, submit
```

No setup needed to start. Without Firebase env vars the app runs on an in-memory copy of the seed data (18 stores, 16 items, about 500 reports, 5 free food events, 5 forum posts). Writes last until the server restarts, and the page re-fetches every 20 seconds so other browsers' reports show up.

## Go live (Firebase + Vercel, about 15 minutes)

1. **Firebase project.** At console.firebase.google.com, create a project, then Build → Firestore Database → Create database → **Start in test mode**, region `us-east1` (closest to NYC).
2. **Web config.** Project settings → Your apps → Web (`</>`) → register the app. Copy the six config values into `.env.local` (template in `.env.example`).
3. **Seed.** `npm run seed`. This must run while Firestore is still in test mode, because the seed has back-dated timestamps the real rules reject.
4. **Lock it down.** `npx firebase-tools login`, then `npx firebase-tools use --add` (pick the project), then `npx firebase-tools deploy --only firestore:rules`. Rules live in `firestore.rules`: anyone can read and add well-formed data, nobody can edit or delete.
5. **Check.** `npm run smoke` and `npm run dev`. Same app, now on Firestore, and new reports appear live in other browsers instantly.
6. **Vercel.** vercel.com → Add New Project → import this repo. Paste the same six `NEXT_PUBLIC_FIREBASE_*` variables under Environment Variables → Deploy.

Do not deploy to Vercel without Firebase: seed mode keeps data in server memory, which is per instance and gets wiped on serverless.

## Hour 0 decisions (locked)

- **Schema:** `src/lib/types.ts`. Store, Item, Report, ForumPost, exactly as in the brief. One addition: Report has an optional `note` for events ("free bagels until 5pm").
- **Nearby view:** plain list, sorted by distance. Mapbox is a stretch goal only if the core loop is done.
- **Timestamps:** milliseconds since epoch (`Date.now()`), everywhere.
- **Prices:** dollars as a number (`3.49`), rounded to cents on write.
- **Events:** a Report with `type: "event"`. `price: 0` means free.
- **Vouching:** the price the most people agree on wins. One person, one vote: only each user's latest report per item and store counts, so spamming does nothing. Reports older than 30 days (relative to the newest) age out. Two-way tie goes to the more recent price, three or more to the median. Logic in `src/lib/vouch.ts`, tests in `scripts/smoke.ts`.
- **UI kit:** shadcn/ui (new-york style, `components.json`), components in `src/components/ui`. Green is `primary`.

## The shared data API (`src/lib/data.ts`)

Everyone imports from here. Do not talk to Firestore directly.

| Function | Returns |
| --- | --- |
| `getStores()` / `getItems()` | everything |
| `getStore(id)` / `getItem(id)` | one, or null |
| `addStore({ name, borough, lat, lng })` / `addItem({ name, category })` | creates it, or returns the existing one with that name |
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

- `/` Nearby: auto location (borough fallback outside NYC), item search, category filter, deals banner, tracked price alerts.
- `/item/[id]`: trusted price at every store, cheapest first, price spread, Track button (in-app alert plus browser notification).
- `/store/[id]`: every trusted price at one store by category, active deals, latest reports.
- `/report`: pick or add an item and store, submit, watch the list below update with your store highlighted.
- `/forum`: borough tabs, post and read, live.

Every page refreshes live: Firestore listeners when configured, 20 second polling in seed mode. Tracked items are kept in the browser (no login). userId is an anonymous cookie.

## Who owns what

- **A, backend:** Firebase project and config, `src/lib/firebase.ts`, `src/lib/data.ts`, `src/lib/vouch.ts`, seed data, price change alerts.
- **B, frontend:** nearby list, report form, category filter, borough forum, Vercel deploy. Add more shadcn components with `npx shadcn@latest add <name>`.
- **C, Gemini:** `/chat` page and `src/app/api/chat/route.ts`, receipt scanning into `submitReport` (use `addItem` for items not in the list). `GEMINI_API_KEY` stays server side.
- **D, Photon:** `src/app/api/photon/route.ts` webhook, text parsing into `submitReport`, batched alerts from `getActiveEvents`.

Put your own code in your own folders so merges stay boring. Pull `main` often.

## Rule of the day

Core loop first: report a price, vouching updates the trusted price, look it up. Everything else sits on top. If something is not working near the end, cut it.
