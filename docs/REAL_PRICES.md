# Real prices for Pricey: what we need

Hey! Thanks for helping. Pricey shows what groceries actually cost at specific NYC stores. Right now the prices are made up for the demo. We want real ones: **18 real NYC stores × 16 items**, saved as two CSV files. Once you send them over, one command loads everything into the app.

## The 18 stores

Pick real stores whose prices are online (store website, weekly circular, or delivery listing):

- Spread across the boroughs: about 6 in Manhattan, 5 in Brooklyn, 4 in Queens, 2 in the Bronx, 1 in Staten Island.
- Mix of chains: Trader Joe's, Whole Foods, Target, Key Food, C-Town, Food Bazaar, Associated, Fairway, H Mart, Western Beef, ShopRite, Stop & Shop, Aldi, Lidl, etc.
- Include 2 or 3 bodegas, delis, or coffee shops if you can find their prices (for the coffee and prepared food items). If not, that's OK, skip those items.

## The 16 items (use these exact item_id values)

Use the **cheapest regular (non-member, non-sale) price** for the most basic version, usually the store brand. If it's on sale, put the sale price in `sale_price` too.

| item_id | What to look for | Price per |
|---|---|---|
| `eggs-dozen` | Large white eggs, 12 count | dozen |
| `milk-gallon` | Whole milk, 1 gallon | gallon |
| `bananas-lb` | Bananas | lb |
| `potatoes-5lb` | Russet potatoes, 5 lb bag | bag |
| `avocado` | Hass avocado, single | each |
| `onions-3lb` | Yellow onions, 3 lb bag | bag |
| `chicken-thighs-lb` | Chicken thighs (boneless skinless if both) | lb |
| `ground-beef-lb` | Ground beef 80/20 | lb |
| `bread-loaf` | Sliced white sandwich bread, about 20 oz | loaf |
| `rice-5lb` | Long grain white rice, 5 lb bag | bag |
| `pasta-1lb` | Spaghetti or penne, 1 lb box | box |
| `black-beans-can` | Black beans, about 15 oz can | can |
| `coffee-drip-small` | Small hot drip coffee | cup |
| `latte-12oz` | Latte, 12 oz / small | cup |
| `bacon-egg-cheese` | Bacon egg and cheese sandwich | sandwich |
| `chicken-over-rice` | Chicken over rice platter | platter |

**Sizes:** if the store only sells a different size, convert to the unit above. For example, a 2 lb bag of onions at $2.50 comes to $3.75 for 3 lb, and a half gallon of milk at $2.99 comes to $5.98 per gallon. Put what the store actually listed in `listed_as` so we can double check.

## File 1: `stores.csv`

```csv
store_id,name,address,borough,lat,lng,source_url
trader-joes-union-sq,Trader Joe's Union Square,142 E 14th St New York NY 10003,Manhattan,40.7334,-73.9876,https://locations.traderjoes.com/ny/new-york/542/
```

- `store_id`: lowercase words with dashes, unique, e.g. `key-food-park-slope`.
- `borough`: exactly one of `Manhattan`, `Brooklyn`, `Queens`, `Bronx`, `Staten Island`.
- `lat`, `lng`: the store's coordinates. In Google Maps, right-click the store pin and click the numbers to copy them. At least 4 decimals, please.

## File 2: `prices.csv`

```csv
store_id,item_id,price,sale_price,listed_as,product_name,source_url,scraped_at
trader-joes-union-sq,eggs-dozen,3.49,,12 ct,Large White Eggs,https://www.traderjoes.com/...,2026-09-26
trader-joes-union-sq,onions-3lb,3.75,,2 lb bag $2.50,Yellow Onions,https://www.traderjoes.com/...,2026-09-26
```

- One row per store and item. Aim for at least 10 of the 16 items per store. Skip rows you can't find; don't guess.
- `price`: a plain number, no `$` sign, already converted to the unit in the table above.
- `sale_price`: leave empty unless there's a sale.
- `scraped_at`: the date you got it, `YYYY-MM-DD`.
- `source_url`: the page it came from, so we can show "from traderjoes.com" and prove the data is real.

## Please keep it clean

- Respect each site's terms and robots.txt, go slowly (no hammering), and don't log into anything. Public price pages only.
- Online prices sometimes differ from the shelf. That's fine; the app lets shoppers vote to correct them.
- Send both files to Reyansh, or put them in the repo at `data/stores.csv` and `data/prices.csv`. Then run `npm run import:prices`.

Thank you!
