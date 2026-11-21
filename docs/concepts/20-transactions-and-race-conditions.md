# 20 – Transactions, ACID and race conditions

Placing an order changes **four** things: product stock, the coupon counter, a new order, and the cart. This doc explains the two problems that brings, and the tools that solve them:

| Problem              | Question                                     | Tool                                                                      |
| -------------------- | -------------------------------------------- | ------------------------------------------------------------------------- |
| **Partial failure**  | What if step 3 of 4 fails?                   | A **transaction** (all-or-nothing)                                        |
| **Race condition**   | What if two people do it at the same moment? | An **atomic conditional update** (+ the transaction's conflict detection) |
| **Repeated request** | What if the same request arrives twice?      | **Idempotency**                                                           |

## 1. Partial failure → transactions

Without a transaction, the checkout is four separate writes:

```text
1. stock of "Mug" 5 → 3          ✅ saved
2. coupon SAVE10 used 7 → 8      ✅ saved
3. create order                  💥 the server crashes
4. empty the cart                (never happens)
```

Now the shop has 2 mugs that nobody bought, a coupon use that nobody got, and a customer who still sees a full cart. Nobody can easily find or fix this.

A **transaction** groups several writes so the database treats them as **one** unit:

```js
const session = await mongoose.startSession();
await session.withTransaction(async () => {
  await Product.updateOne(filter, change, { session }); // "part of the transaction"
  await Coupon.updateOne(filter, change, { session });
  await Order.create([order], { session });
  await cart.save({ session });
}); // ← reaching the end = COMMIT. Any throw inside = ABORT (everything is undone)
await session.endSession();
```

- **Commit**: every write becomes visible to everyone, at the same moment.
- **Abort / rollback**: every write is thrown away, as if nothing happened.
- `{ session }` on each operation is what makes it part of the transaction. Forget it, and that write is **not** undone. This is the most common transaction bug.
- MongoDB transactions need a **replica set** (Atlas always is one; our tests start an in-memory one; the local Docker Mongo is one too).

### ACID in plain words

| Letter          | Means                           | In our checkout                                             |
| --------------- | ------------------------------- | ----------------------------------------------------------- |
| **A**tomicity   | All or nothing                  | Stock, coupon, order and cart change together or not at all |
| **C**onsistency | Rules hold before and after     | Stock ≥ 0, totals add up, coupon uses ≤ limit               |
| **I**solation   | Others don't see half-done work | Another request never sees "stock taken but no order yet"   |
| **D**urability  | Committed = saved for good      | After the 201, a crash doesn't lose the order               |

### Rules of thumb

- Keep transactions **short**: only database work inside. No emails, no HTTP calls to other services. (We send the confirmation email **after** the commit, otherwise a rolled-back order could still get an email.)
- Let `withTransaction()` **retry**. It reruns your function on temporary errors, so build every value **inside** the function (our `items`, `problems`, `discount` are declared inside).
- Throwing is how you roll back. `throw new ApiError(409, …)` inside the callback undoes everything and still reaches the error handler.

## 2. Race conditions → atomic conditional updates

A **race condition** is a bug that only appears when two things happen at (almost) the same time, so the result depends on who "wins the race".

The classic oversell, with 1 mug left:

```text
time   Ali's request                    Sara's request
 t1    read stock → 1
 t2                                     read stock → 1
 t3    1 >= 1 ✅ → write stock 0
 t4                                     1 >= 1 ✅ → write stock 0
       → TWO orders for ONE mug (stock should be -1)
```

The bug is the gap between **read** and **write** ("check-then-act"). The fix is to let the database do the check and the write in **one** operation:

```js
// "Decrease stock by qty, but ONLY IF stock is still >= qty"
const r = await Product.updateOne(
  { _id: productId, isActive: true, stock: { $gte: qty } }, // the condition
  { $inc: { stock: -qty, sold: qty } }, // the change
  { session },
);
const reserved = r.modifiedCount === 1; // 0 = someone else got there first
```

A single-document update in MongoDB is **atomic**: no other write can sneak in between "check" and "change". If Sara's update runs second, its condition (`stock >= 1`) no longer matches, `modifiedCount` is 0, and she gets **409 "Only 0 left in stock"**.

The coupon uses the same pattern:

```js
Coupon.updateOne(
  {
    _id,
    $or: [
      { usageLimit: null },
      { $expr: { $lt: ["$usedCount", "$usageLimit"] } },
    ],
  },
  { $inc: { usedCount: 1 } },
);
```

### How the transaction helps too

Inside a transaction, if two transactions write the **same document**, MongoDB stops the later one with a **write conflict** (a "TransientTransactionError"). `withTransaction()` retries it from the start, and the retry sees the new stock. So in our checkout there are two safety nets: the conditional update and the conflict detection. `tests/integration/orders.transaction.test.js` fires parallel requests and checks that exactly as many orders succeed as there are units.

### Other places this pattern shows up

- Seat booking, ticket sales, flash sales (`seatsLeft >= 1`)
- Bank transfers (`balance >= amount`)
- "Like" counters, rate limits, usage quotas (`$inc` instead of read + write)

## 3. Idempotency: the same request twice

An operation is **idempotent** if doing it twice has the same effect as doing it once. `GET` and `PUT` should be idempotent; "place an order" (`POST`) is not by nature: two clicks could mean two orders.

What protects us here:

- **Place order**: the first request empties the cart, so a second identical request finds an empty cart → 400. Only one order exists (tested with two parallel requests).
- **Cancel**: the status is checked again **inside** the transaction. The second cancel sees `cancelled`, the state machine refuses it (400), so the stock is restored only once.

What big shops add: an **Idempotency-Key** header. The client creates a random key per checkout attempt; the server stores it with a unique index and returns the **same** order for a repeated key instead of an error. Stripe's API works this way. (Exercise 3 in the [module guide](../modules/07-orders.md).)

> **Try it**
>
> 1. Run `npm test -- -t "ONE unit left"`. It sends two orders in parallel for the last unit.
> 2. In `product.model.js`, change `reserveStock` to: find the product, `if (p.stock < qty) return false`, then `p.stock -= qty; await p.save({ session })`. Run the test again. (Inside the transaction, conflict detection still saves you. Now also remove `{ session }`… and watch it oversell.) Undo afterwards!
> 3. In `order.service.js`, move `await cart.save({ session })` _before_ `Order.create` and make `Order.create` throw. Is the cart emptied? Why not?

## Check yourself

1. What does the "A" in ACID promise, and which test proves it here?
2. Why is "read stock, check in JS, then write" wrong, even if the code looks correct?
3. What does `modifiedCount === 0` mean after `reserveStock`?
4. Why is the confirmation email sent after the transaction and not inside it?
5. Why must the variables be created _inside_ the `withTransaction` callback?
6. Is `POST /orders` idempotent? What stops a double click from creating two orders?

## In this repo

- `server/src/modules/orders/order.service.js` (`placeOrderOnce`, `cancelWithRestore`)
- `server/src/modules/products/product.model.js` (`reserveStock`, `releaseStock`)
- `server/src/modules/coupons/coupon.model.js` (`consume`, `release`)
- `server/tests/integration/orders.transaction.test.js`
- Earlier, smaller transaction: `server/src/modules/addresses/address.service.js` (`makeDefault`)
