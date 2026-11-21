# 16 – Catalog queries: pagination, filtering, sorting, text search, indexes and stock

A shop's product list looks simple: "show me shirts under Rs 3,000, cheapest first, page 2". Behind it are six ideas that every list API in the world uses. Branch 04 introduces all of them.

```
GET /api/products?category=men&maxPrice=3000&keyword=cotton&sort=price_asc&page=2&limit=12
                  └──────── filter ────────┘ └─ search ──┘ └── sort ──┘ └─ pagination ─┘
```

## 1. Pagination: one page at a time

A catalogue can hold 10,000 products. Sending them all at once would be slow for the database, the network and the phone that has to draw them. So the client asks for **one page**:

| Term    | Meaning                                      | Example (page 2, 12 per page) |
| ------- | -------------------------------------------- | ----------------------------- |
| `page`  | which page (starts at 1)                     | 2                             |
| `limit` | how many per page (capped)                   | 12                            |
| `skip`  | how many to jump over = `(page - 1) × limit` | 12                            |
| `total` | how many match in all                        | 30                            |
| `pages` | `ceil(total / limit)` (at least 1)           | 3                             |

```js
// src/utils/pagination.js
const { page, limit, skip } = getPagination(req.query, 12, 48); // defaults, max
Product.find(filter).sort(sort).skip(skip).limit(limit);
```

The response carries the numbers so the UI can draw "Page 2 of 3":

```json
{ "success": true, "data": [ … 12 products … ], "meta": { "page": 2, "limit": 12, "total": 30, "pages": 3 } }
```

**Rules that protect the server:**

- `limit` is **capped** (48 for the shop, 100 for the admin table). Nobody can ask for a million rows.
- Bad values (`page=-3`, `limit=abc`) quietly become safe defaults. A list endpoint should be forgiving.
- The list and the count run **in parallel** (`Promise.all`), so two queries cost about one round-trip.

**A trap: unstable sort order.** If two products have the same price, MongoDB may return them in a different order on the next request. Product X can then show up on page 1 _and_ page 2, while product Y never shows. The fix is a **tie-breaker**: every sort ends with `_id`, which is unique:

```js
price_asc: { price: 1, _id: 1 }
```

> **Skip vs. cursor pagination.** `skip` gets slower on very deep pages (page 5,000 means the database walks past 60,000 entries). Huge feeds such as Twitter use _cursor_ pagination instead ("give me 12 after id X"). For a shop catalogue, skip is simple and fine.

## 2. Filtering: a whitelist, never the raw query

Filtering decides **which** documents are in the list. The tempting shortcut is dangerous:

```js
// ❌ NEVER: the client controls the whole MongoDB filter
Product.find(req.query);
// GET /api/products?isActive=false   → shows hidden products
// GET /api/products?price[$gt]=0     → operators straight into the database
```

`src/modules/products/product.query.js` builds the filter from a **whitelist**: it reads only the parameters it knows, converts each to the right type, and ignores everything else.

| Query                        | Becomes                                          | Note                                       |
| ---------------------------- | ------------------------------------------------ | ------------------------------------------ |
| _(always)_                   | `isActive: true`                                 | the public can never see inactive products |
| `category=men`               | `category: { $in: [men, men's sub-categories] }` | the slug is looked up by the service       |
| `minPrice=500&maxPrice=3000` | `price: { $gte: 500, $lte: 3000 }`               | `$gte` = "≥", `$lte` = "≤"                 |
| `rating=4`                   | `ratingAverage: { $gte: 4 }`                     | capped at 5                                |
| `inStock=true`               | `stock: { $gt: 0 }`                              | only the exact text `"true"`               |
| `isFeatured=true`            | `isFeatured: true`                               |                                            |
| `brand=khaadi`               | `brand: /^khaadi$/i`                             | exact, ignoring case, **escaped**          |
| anything else                | _(ignored)_                                      |                                            |

**Why escape the brand?** In a regular expression `.` means "any character" and `(a+)+$` can make the regex engine run for minutes (a **ReDoS** attack). `escapeRegex()` makes every character literal.

## 3. Sorting: also a whitelist

Sorting decides the **order**. The client chooses a _name_, never a field:

| `?sort=`           | MongoDB sort                                      |
| ------------------ | ------------------------------------------------- |
| `newest` (default) | `{ createdAt: -1, _id: -1 }`                      |
| `price_asc`        | `{ price: 1, _id: 1 }`                            |
| `price_desc`       | `{ price: -1, _id: -1 }`                          |
| `rating`           | `{ ratingAverage: -1, ratingCount: -1, _id: -1 }` |
| `popular`          | `{ sold: -1, _id: -1 }`                           |

Unknown names fall back to `newest`. `getSort()` uses `Object.hasOwn`, so tricks like `?sort=__proto__` don't work either.

## 4. Text search: a text index

"Find _cotton shirt_" needs **word** matching across several fields. A regex `/cotton/` over every description would read every document (slow) and can't rank results. MongoDB's **text index** splits the text into words and stems them (_shirts_ → _shirt_):

```js
productSchema.index(
  { name: 'text', brand: 'text', description: 'text' },
  {
    weights: { name: 10, brand: 5, description: 1 },
    name: 'product_text_search',
  },
);
// query
Product.find({ isActive: true, $text: { $search: 'cotton shirt' } });
```

- **Weights:** a match in the _name_ counts 10×, in the _brand_ 5×, in the _description_ 1×.
- A collection can have only **one** text index.
- It matches **whole words**. "shi" doesn't find "shirt". For "search as you type" you would use Atlas Search or a search engine (Elasticsearch, Meilisearch).
- The admin table searches name/SKU with an **escaped, case-insensitive regex** instead, because admins type parts of SKUs (`MUG-`).

## 5. Indexes for queries: match the index to the list

Without an index, MongoDB reads **every** document for every list (a _collection scan_). An index is a sorted list it keeps on the side, so it can jump straight to the matches. A **compound index** serves queries that _filter_ on the first field(s) and _sort_ on the next:

| Index                                    | Serves                                 |
| ---------------------------------------- | -------------------------------------- |
| `{ isActive: 1, createdAt: -1 }`         | the default list: active, newest first |
| `{ isActive: 1, price: 1 }`              | `sort=price_asc` / `price_desc`        |
| `{ isActive: 1, ratingAverage: -1 }`     | `sort=rating`                          |
| `{ isActive: 1, sold: -1 }`              | `sort=popular`                         |
| `{ isActive: 1, isFeatured: 1 }`         | the home page's featured products      |
| `{ category: 1, isActive: 1, price: 1 }` | a category page with a price filter    |
| `{ isActive: 1, stock: 1 }`              | the admin's low-stock list             |
| `slug` unique, `sku` unique              | find by slug; no duplicate SKUs        |
| text index                               | keyword search                         |

**Indexes cost something:** every insert and update must also update every index, and they use RAM. So add an index for each _real_ query, not for every field. To see whether a query uses an index, ask MongoDB to explain it:

```js
await Product.find({ isActive: true }).sort({ price: 1 }).explain('executionStats');
// look for "IXSCAN" (index used) instead of "COLLSCAN" (whole collection read)
```

See also [10 – Databases and indexes](10-databases-and-indexes.md).

## 6. Stock: change it atomically

Stock is a number that many requests change at the same moment. The naive way breaks:

```js
// ❌ RACE CONDITION: two shoppers, 1 item left
const p = await Product.findById(id); // both read stock = 1
if (p.stock >= 1) {
  p.stock -= 1;
  await p.save();
} // both save stock = 0 → 2 items sold!
```

The fix: send the **condition and the change in one command**. MongoDB updates a single document atomically, so the second request simply doesn't match:

```js
// ✅ product.model.js → Product.reserveStock()
await Product.updateOne(
  { _id: id, isActive: true, stock: { $gte: qty } }, // condition
  { $inc: { stock: -qty, sold: qty } }, // change
);
// modifiedCount === 1 → reserved; 0 → not enough stock
```

`tests/integration/product.model.db.test.js` starts 10 "buy" requests at once for 3 items and checks that exactly 3 win.

Branch 04 uses the same trick for **manual stock changes by admins** (`PATCH /api/products/:id/stock`), and also writes a **stock history** entry in the same command (`$push` with `$slice: -50` keeps only the last 50):

| `mode`   | `value` | Effect                                                                  |
| -------- | ------- | ----------------------------------------------------------------------- |
| `adjust` | `+20`   | new delivery: stock + 20                                                |
| `adjust` | `-2`    | damaged: stock − 2 (refused if that would go below 0)                   |
| `set`    | `30`    | shelf count: stock becomes 30 (stored in the history as the difference) |

`PUT /api/products/:id` deliberately **ignores** `stock`. Only the stock route changes it, so every change has a reason and an author.

> **Try it**
>
> 1. `npm test -- tests/integration/products.test.js -t "pagination"` and read the tie-breaker test.
> 2. In Swagger (`/api/docs`), call `GET /products?sort=price_asc&limit=2&page=2`, then change `page`.
> 3. Remove `_id` from `SORTS.price_asc` and run the tie-breaker test a few times. What can go wrong?

## Check yourself

1. Page 3 with 12 per page: what are `skip` and `limit`?
2. Why must every sort end with `_id`?
3. Why is `Product.find(req.query)` dangerous? Give two attacks.
4. When would you use a text index, and when an escaped regex?
5. Which index serves "active products, cheapest first"?
6. Why can't "read stock, check, save" be used for buying?

## In this repo

- `server/src/utils/pagination.js`
- `server/src/modules/products/product.query.js`
- `server/src/modules/products/product.model.js` (indexes, text index, stock statics)
- `server/src/modules/products/product.service.js`
- `server/tests/unit/product.query.test.js`, `server/tests/integration/products.test.js`, `server/tests/integration/product.model.db.test.js`
