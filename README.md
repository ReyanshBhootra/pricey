# Pricey

Real grocery and food prices across NYC, reported by New Yorkers and trusted through vouching.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm run smoke         # vouching, trust, grounding, price history, shopping list, importer
npm run test:texting  # texting rules and profiles
npm run test:agent    # the Gemini texting agent, with a scripted stand-in for Gemini
```

No setup needed to start. Without Firebase env vars the app runs on an in-memory copy of the seed data (18 stores, 16 items, about 1,100 reports spread over six weeks with realistic price drift, free food events, forum posts). Writes last until the server restarts, and the page re-fetches every 20 seconds so other browsers' reports show up.

## Go live (Firebase + Vercel, about 15 minutes)

1. **Firebase project.** At console.firebase.google.com, create a project, then Build → Firestore Database → Create database → **Start in test mode**, region `us-east1` (closest to NYC).
2. **Web config.** Project settings → Your apps → Web (`</>`) → register the app. Copy the six config values into `.env.local` (template in `.env.example`).
3. **Seed.** `npm run seed`. This must run while Firestore is still in test mode, because the seed has back-dated timestamps the real rules reject.
4. **Lock it down.** `npx firebase-tools login`, then `npx firebase-tools use --add` (pick the project), then `npx firebase-tools deploy --only firestore:rules`. Rules live in `firestore.rules`: anyone can read and add well-formed data, nobody can edit or delete.
5. **Check.** `npm run smoke` and `npm run dev`. Same app, now on Firestore, and new reports appear live in other browsers instantly.
6. **Gemini.** Get a free key at aistudio.google.com/apikey and set `GEMINI_API_KEY` in `.env.local`. Without it, chat still answers from data and receipt scanning shows a friendly "not set up" message.
7. **Vercel.** vercel.com → Add New Project → import this repo. Paste the six `NEXT_PUBLIC_FIREBASE_*` variables and `GEMINI_API_KEY` under Environment Variables → Deploy.
8. **Map.** Make a free public token (starts with `pk.`) at account.mapbox.com and set `NEXT_PUBLIC_MAPBOX_TOKEN` in Vercel. Never put it in code: GitHub blocks pushes that contain it. Without it, the Map tab shows a "not set up" note and everything else works.
9. **Logins.** Firebase console → Authentication → Sign-in method → enable **Phone**. Add test numbers with fixed codes (no real texts, no billing) and add your Vercel domain under Authorized domains. Set `AUTH_SECRET` (any long random string) in Vercel; it signs the login cookie.

Do not deploy to Vercel without Firebase: seed mode keeps data in server memory, which is per instance and gets wiped on serverless.

## Hour 0 decisions (locked)

- **Schema:** `src/lib/types.ts`. Store, Item, Report, ForumPost, exactly as in the brief. One addition: Report has an optional `note` for events ("free bagels until 5pm").
- **Nearby view:** list sorted by distance, or the Map tab. Distances are stored in km and always shown in miles.
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

## Gemini: chat and receipts (C, done)

- `/chat` (Ask in the nav): questions like "how much are eggs near me", "what can I cook for under $10", "any free food right now". Uses the person's location if they allowed it.
- **Grounding** (`src/lib/grounding.ts`): `buildContext(question, location)` builds a fact sheet from our data (prices for items in the question with distance and vote counts, cheapest price per item nearby, active deals). Gemini gets it as `DATA` with a system prompt that forbids inventing prices. Grounds on the last 3 questions so follow-ups keep their item.
- **Speed and limits** (`src/lib/gemini.ts`): chat streams word by word from `gemini-flash-lite-latest` with thinking off; receipts use `gemini-flash-latest`. If a model is rate limited (free tier) or missing, the other one answers and the busy one rests. Hard time limits everywhere. Vercel logs one `Gemini <model> ok/busy/...` line per attempt.
- **Fallback:** if Gemini has no key, errors, or hits quota on every model, `answerFromData` answers price, deal, and budget meal questions straight from the data, marked "Answered from price data". The demo never shows a dead chat.
- `/scan` (linked from Report): photo is shrunk in the browser, sent to `/api/receipt`, Gemini returns JSON (schema enforced) with store and lines matched to our catalog. The server drops bad prices and unknown ids. The person reviews, edits, and unticks lines before anything is saved, then each line becomes a report (new items are created).
- **Person D:** reuse `buildContext` + `SYSTEM_PROMPT` + `answerFromData` for replies to texts. Same grounding, same fallback.

## Texting and free food alerts (D, done)

- **Text Pricey** (`src/lib/texting.ts`, now mostly handled by the agent below; these rules are the backup): `eggs 3.99 at key food park slope` reports a price (vouching applies, one vote per phone), `free bagels at myrtle deli until 5pm` posts a deal, `deals in brooklyn` returns "N spots have discounts right now", `alerts on brooklyn` / `stop` manage alerts, anything else is answered by Gemini with the same grounding and fallback as the chat. Phone numbers are never stored, only a one-way hash.
- **Free food / deals in the app:** Report page, "Free food or deal" tab. Same pipeline (a report with `type: "event"`). Shows in the Nearby deals banner and in texted alerts. Duplicates show once.
- **Try it without a phone:** `/text` is an iMessage-style simulator using the same handler.
- **Real iMessage via Photon:** `bot/` is a tiny Spectrum relay that forwards texts to `/api/text` (locked with `TEXT_BOT_SECRET`) and every few minutes sends subscribers one bundled alert from `/api/text/digest`. Beginner setup in `bot/README.md` (`cd bot && npm run setup && npm start`). Needs your phone, and any tester phones, added in the Photon dashboard.
- Tests: `npm run test:texting` (parsing and replies), `cd bot && bun test` (the relay, with Photon faked, against a running app).

Every page refreshes live: Firestore listeners when configured, 20 second polling in seed mode.

## Added after the hackathon split

- **Texting agent** (`src/lib/agent.ts`, `src/lib/agent-tools.ts`): Gemini reads each text and calls tools (look up prices, report, post a deal, set home, forum, track, alerts, receipts, shopping list). Every fact comes from a tool result, never from the model. Warm welcome once per person, a 👍 tapback after saves, the contact card on first text, replies in the language they text in. If Gemini is down, the rule-based replies take over.
- **Home ZIP** (`src/lib/places.ts`): every NYC ZIP plus about 75 neighborhoods. Text a ZIP or share a location pin and distances read like "0.6 mi from 11215, 12 min walk".
- **Map** (`src/components/price-map.tsx`): Mapbox, Snapchat style. Price pins, a glow where people are reporting, filters (cheapest, deals now, trending, popular, favorites, categories), and a store card with directions.
- **Accounts** (`/login`, `/profile`): phone number and code through Firebase Phone Auth. The same phone is the same account on iMessage. Anonymous reports carry over when you log in. Trust score: after 3 comparisons, people who usually match the crowd count up to 1.5x and people who are usually off count down to 0.5x.
- **Shopping list** (`/list`, `src/lib/optimizer.ts`): the cheapest sensible trip for a whole list. Walking up to about 15 minutes is free, the subway counts as $2.90 each way, stores more than 3 miles away are skipped, and a second store is only suggested when it is next door (or you walk to both) and saves at least $3. Also in chat and texts ("need eggs, milk and bread").
- **Price history** (`src/lib/history.ts`): item pages show a month trend line ("Up 17% this month"), and the agent can mention it.
- **Still $3.99?**: prices nobody has confirmed in a week ask for a one-tap confirm on item pages, and people who text get one check-in a day about a stale price at a store they use.
- **Real prices** (`npm run import:prices`): see below.

## Real prices from store websites

Your friend's scraper follows `docs/REAL_PRICES.md` and produces either one JSON file, `data/pricey-prices.json`, or `data/stores.csv` and `data/prices.csv`. Then:

```bash
npm run import:prices -- --check      # validates only: line-by-line errors, unit mix-up warnings
npm run import:prices                 # writes src/lib/real-prices.json
npm run import:prices -- --only-real  # same, but hides the made-up demo stores and prices
npm run import:prices -- --clear      # back to demo data only
```

Commit `src/lib/real-prices.json` and push. It ships with the app and the data layer merges it in on every read, so it works with or without Firebase and needs no database writes. Real prices replace the demo votes for the same store and item (so made-up reporters can't outvote them), each website counts as one voice, and shoppers who report a different shelf price outvote it the normal way. Store pages say where the starting prices came from.

## Who owns what

- **A, backend:** Firebase project and config, `src/lib/firebase.ts`, `src/lib/data.ts`, `src/lib/vouch.ts`, seed data, price change alerts.
- **B, frontend:** nearby list, report form, category filter, borough forum, Vercel deploy. Add more shadcn components with `npx shadcn@latest add <name>`.
- **C, Gemini:** done, see above. `src/lib/gemini.ts`, `src/lib/grounding.ts`, `src/lib/receipt.ts`, `src/app/api/chat`, `src/app/api/receipt`.
- **D, Photon:** done, see above. `src/lib/texting.ts`, `src/app/api/text`, `bot/`.

Put your own code in your own folders so merges stay boring. Pull `main` often.

## Rule of the day

Core loop first: report a price, vouching updates the trusted price, look it up. Everything else sits on top. If something is not working near the end, cut it.
