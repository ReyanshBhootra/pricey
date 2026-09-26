# Pricey, Project Context

Read this before you start. It covers what we are building, the stack, the schema, and who owns what.

## What we are building

Pricey is a crowdsourced grocery and food price tracker for NYC. Online listings do not show what a specific store actually charges, so people report real prices and everyone benefits. Prices are trusted through vouching, so no single fake report can distort them.

Scope is NYC only.

## What a user can do

- See nearby stores with real prices on grocery and food items, reported by other people  
- Submit a price by typing it in, or by scanning a receipt photo  
- Filter by category (produce, coffee, prepared food, etc.)  
- Trust prices through vouching: if 10 people say potatoes are \$10 at ShopRite and 2 say \$7, the app shows \$10  
- Get an alert when a tracked item's price changes  
- See free food and pop-up alerts, batched into one notification like "5 spots near you have discounts right now"  
- Post and read in a community forum, tabbed by borough  
- Ask a Gemini chatbot questions like "how much are eggs near me" or "what can I cook cheap right now"  
- Do all of this by texting instead of opening the app, through the Photon iMessage layer

## Stack

- Next.js: the app, all screens and logic  
- Tailwind CSS: styling  
- shadcn/ui: prebuilt components so it looks designed  
- Firebase Firestore: the database, shared by the app, chatbot, and Photon  
- Gemini API: chatbot brain and receipt reading  
- Photon: iMessage layer  
- Vercel: hosting, gives us the live URL  
- Browser geolocation: user location for the nearby view  
- Nearby view is a Mapbox map 

## Schema (lock this at hour 0 before anyone splits)

Everyone reads and writes the same database. Agree on this first or nothing connects.

- Store: name, borough, lat, lng  
- Item: name, category  
- Report: itemId, storeId, price, timestamp, userId, type (price or event)  
- Forum post: borough, text, timestamp, userId

## How we work

Agree on the schema together at hour 0, then split and work alone.

To work in parallel without waiting on each other: Person A defines the exact shape of a Report at hour 0\. Everyone else hardcodes a few fake reports in that shape and builds their whole feature against them. When A's real functions are ready, swap the fake data for real calls.

Sync points:

- B and A sync once, when B swaps placeholder data for A's real read functions  
- C and D sync once in the middle, since both send data to Gemini and can share the same grounding pattern  
- Everyone syncs at the end to wire all four pieces into the one deployed app and test together

## Who owns what

### Person A, Backend, data, and notifications

- Firebase and Firestore setup, share config with the team  
- All collections: Store, Item, Report, Forum post  
- Read functions: nearby stores, prices for an item, reports for a store  
- Write function: submit a report  
- Vouching logic: majority or median price wins across reports  
- Price change detection: flag when a new report changes an item's trusted price  
- Seed 15 to 20 real-looking NYC entries so nothing demos empty

### Person B, Core frontend and forum

- Scaffold Next.js with Tailwind and shadcn, deploy to Vercel  
- Nearby view: stores and trusted prices, filterable by category  
- Report submission screen: type item, store, price, watch it appear live  
- Category filtering  
- Borough forum: post and read, tabbed by borough  
- Wire all screens to Person A's Firestore functions

### Person C, Gemini, chatbot and receipt scanning (senior)

- Gemini API setup  
- Chat screen in the app  
- Grounding logic: pull prices from Firestore, pass to Gemini, return a grounded answer  
- Price questions first, then meal-on-a-budget suggestions  
- Receipt scanning: photo goes to Gemini, Gemini returns item and price, that becomes a report

### Person D, Photon iMessage and free food alerts

- Photon and iMessage setup  
- Parse incoming texts into structured reports  
- Reply logic for price lookups and discount summaries  
- Free food and pop-up alerts: same reporting pipeline, different content type  
- Batched notification: one alert like "5 spots near you have discounts right now"  
- Wire Photon to the same Firestore data

## Judging (what we are optimizing for)

- Concept 30 percent  
- Functionality 30 percent (does it work, how well does the demo run, is it scalable)  
- Wow Factor 20 percent  
- User Experience and Design 10 percent  
- Value to Community 10 percent

Functionality is a third of the score. A clean demo of a working core beats an ambitious app that breaks. Every feature ships in its simplest working form. Nobody gold-plates anything.

## Rules

- Core loop (report a price, vouching updates the trusted price, look it up) must work first. Everything else is on top of it.  
- Build every feature thin. One working example beats a polished version of one feature and broken versions of the rest.  
- If a feature is not done near the end, cut it rather than let it break the core.  
- No blockchain.