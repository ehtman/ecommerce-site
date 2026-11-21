# 19 – Coupons: money math, validity windows and atomic counters

A coupon looks like a small feature: "type EID25, get 25% off". But it touches money, time and concurrency, three places where small mistakes get expensive. This doc explains the four ideas branch 06 relies on.

## 1. Money is a whole number

In JavaScript, decimals are stored in binary floating point, and many of them aren't exact:

```js
0.1 + 0.2;          // 0.30000000000000004
999 * 0.15;         // 149.85
1000 * 0.07;        // 70.00000000000001
```

Add a few hundred of those together (order totals, reports, refunds) and the cents drift. Shops avoid this by storing money as **integers in the smallest unit the shop uses**. ShopEase sells in Pakistani rupees without paisa, so every price, discount and total is a **whole number of rupees**.

The rules that follow from that:

| Rule | In the code |
|---|---|
| Every money field is an integer | `validate: int` on `value`, `maxDiscount`, `minOrderAmount`; `isInt()` in validation |
| Percentages are applied with **multiply first, divide last** | `(subtotal * value) / 100` |
| Round **once**, at the end, and **down** | `Math.floor(...)`: the shop never gives away a fraction of a rupee |
| Totals are built only from integers | `calcTotals(itemsPrice, discountPrice)` in `utils/pricing.js` |

Example: 15% of Rs 999 is 149.85. `Math.floor` gives **149**. The customer pays 999 − 149 = **850**, which is a whole number with nothing left over to round.

> Shops that sell in cents (USD, EUR) do the same thing, just in cents: `$12.99` is stored as `1299`.

### Caps and floors

A discount must stay inside sensible limits:

```
discount = percentage ? floor(subtotal × value / 100) : value
if percentage and maxDiscount:  discount = min(discount, maxDiscount)   // "20% off, max Rs 1,000"
discount = min(discount, subtotal)                                     // never below zero
```

The last line matters for **fixed** coupons: Rs 500 off a Rs 300 cart gives Rs 300 off, never a total of "minus Rs 200".

Admins get limits too: a percentage coupon is 1–90% and a fixed coupon is Rs 1–100,000 (`LIMITS.COUPON_MAX_PERCENT`, `LIMITS.COUPON_MAX_FIXED`). A typo like `900` instead of `90` is refused before it can give the shop away.

### Shipping after the discount

Free shipping starts at Rs 5,000. That threshold is checked on the amount **after** the discount:

| Cart | Coupon | After discount | Shipping |
|---|---|---|---|
| Rs 5,200 | none | 5,200 | free |
| Rs 5,200 | Rs 500 off | 4,700 | Rs 250 |

Otherwise a coupon could make an order cheaper *and* keep free shipping that it no longer qualifies for.

## 2. Validity windows

A coupon only works between two moments: `startsAt ≤ now ≤ expiresAt`. That's its **validity window**.

```
        scheduled        |        active         |      expired
 ───────────────────────[startsAt]─────────────[expiresAt]──────────▶ time
```

- Dates are stored in **UTC** (MongoDB `Date`), so it doesn't matter which time zone the server runs in. The frontend converts to local time for display.
- The model refuses a window that ends before it starts (`expiresAt > startsAt`).
- "Expired" isn't stored. It's **computed** from the clock each time (`checkUsable`, and the `state` virtual), because nothing writes to the coupon at the moment it expires.
- `checkUsable(subtotal, now = new Date())` takes the time as a parameter. Tests pass a fixed `now`, so they can check "not active yet" and "expired" without waiting days or mocking the clock.

The full list of checks, cheapest first: active? → started? → not expired? → uses left? → minimum order reached? The first one that fails becomes the message, e.g. `Coupon expired` or `Minimum order is Rs 3,000`.

## 3. Codes are case-insensitive

People type `eid25`, `Eid25 ` or `EID25`. All three should work. The rule is simple: **normalize once, at every entrance**.

| Where | What happens |
|---|---|
| Admin form (validation) | `.trim().toUpperCase()` before the pattern check |
| Model | `uppercase: true, trim: true` (also covers scripts that skip the HTTP layer) |
| Customer lookup | `String(code).trim().toUpperCase()` before `findOne` |

Because every stored code is uppercase, the plain unique index on `code` is enough to stop duplicates. `EID25` and `eid25` can't both exist. The pattern `^[A-Z0-9]{3,20}$` keeps codes easy to read aloud and print: no spaces, no symbols, nothing that looks like `0`/`O` confusion in a URL.

**Duplicate codes → 409 Conflict.** The service checks first (`assertCodeFree`) to give a clear message. The **unique index** is the real guarantee: two admins saving the same code at the same instant both pass the check, and MongoDB refuses the second insert with error 11000, which `error.middleware.js` also turns into 409. The test "the unique index stops two identical codes created at the same instant" shows this.

## 4. Atomic counters and race conditions

A coupon can have a `usageLimit` ("first 100 customers"). Counting uses looks easy:

```js
// ❌ RACE CONDITION
const coupon = await Coupon.findById(id);
if (coupon.usedCount >= coupon.usageLimit) throw new Error('used up');
coupon.usedCount += 1;
await coupon.save();
```

Two customers check out at the same moment, and one use is left (`usedCount: 99`, `usageLimit: 100`):

| Time | Request A | Request B |
|---|---|---|
| t1 | reads 99 | |
| t2 | | reads 99 |
| t3 | 99 < 100 ✔, saves 100 | |
| t4 | | 99 < 100 ✔, saves 100 |

Both orders get the discount, and the counter says 100 when it should say 101. One update was **lost**. That's a **race condition**: the result depends on the timing of requests that overlap.

The fix is to let the **database** do the check and the change in **one atomic operation**:

```js
// ✅ ATOMIC: check + increment in one step
const result = await Coupon.updateOne(
  { _id: id, isActive: true,
    $or: [{ usageLimit: null }, { $expr: { $lt: ['$usedCount', '$usageLimit'] } }] },
  { $inc: { usedCount: 1 } },
);
return result.modifiedCount === 1;   // false = someone else took the last use
```

MongoDB applies an update to a single document as one indivisible step. Of the two requests, the first matches and increments to 100. The second one now finds `usedCount: 100`, the filter `usedCount < usageLimit` no longer matches, and it gets `modifiedCount: 0`. No lost update, no overselling.

- `$inc` adds on the server, so our code never does "read, add one, write back".
- `$expr` lets a filter compare **two fields of the same document** (`usedCount` and `usageLimit`).
- `Coupon.release` is the reverse (`$inc: -1`). Its filter says `usedCount > 0`, so the counter can never go negative.

The integration test fires **10 `consume` calls at once** at a coupon with `usageLimit: 1` and checks that exactly one wins.

The same pattern protects **stock** in branch 07 (`stock: { $gte: qty }` + `$inc: { stock: -qty }`). In branch 07 it runs inside a **transaction** with the order insert. If anything later in the checkout fails, the coupon use is rolled back too.

### Preview ≠ use

`POST /api/coupons/validate` only **previews**: it calculates the discount on the current cart and changes nothing. A customer can preview as often as they like. The coupon is used once, at checkout, where it is **checked again** (it may have expired, or been used up, since the preview) and then consumed atomically.

## Try it

1. In `coupon.model.js`, replace the body of `consume` with the ❌ read–check–save version above. Run `npm test -- -t "race"`. How many of the 10 parallel calls "win"?
2. Change `Math.floor` to `Math.round` in `calculateDiscount`. Which unit test fails, and why does it matter for the shop?
3. Use `0.15 * 999` instead of `(999 * 15) / 100` and print both in Node. Then try `0.07 * 1000`.

Related: [10 – Databases and indexes](10-databases-and-indexes.md) (unique indexes), [07 – Error handling](07-error-handling.md) (11000 → 409), [06 – Validation and trust](06-validation-and-trust.md) (never trust a client's prices).
