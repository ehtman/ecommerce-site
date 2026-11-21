/**
 * src/modules/cart/cart.service.js – business logic of the shopping cart.
 *
 * Layers: routes → controller → SERVICE → model. No req/res here; errors are ApiErrors.
 * Used by: cart.controller.js (and, in branch 07, the order service reads the cart at checkout).
 *
 * Three ideas meet here:
 *
 * 1) SERVER-SIDE PRICE CALCULATION. The cart stores only { product, quantity }. Every time
 *    the cart is shown we read the CURRENT price of each product from the database and
 *    compute line totals, subtotal, shipping and total here. The client never sends a price,
 *    and if it tries, nobody reads it. See docs/concepts/18-transactions-and-atomic-updates.md.
 *
 * 2) STOCK AND LIMIT RULES (BR-04). A line may hold at most 10 pieces AND never more than
 *    the product's stock. Adding a product that is already in the cart ADDS to its quantity,
 *    and that new total must also respect both limits.
 *
 * 3) "ISSUES" INSTEAD OF SILENT CHANGES. A product can be switched off or sell out AFTER a
 *    customer put it in the cart. We do not quietly delete or shrink the line (the customer
 *    would be confused). We keep it, mark it with an `issue` text, leave it out of the
 *    totals, and set `hasIssues: true` so the frontend can block checkout until it is fixed.
 */
import { Cart, Product } from '../models.js';
import ApiError from '../../utils/ApiError.js';
import { LIMITS, PRICING } from '../../config/constants.js';
import { calcShipping } from '../../utils/pricing.js';

// Only the product fields the cart page needs (smaller response, nothing internal)
const PRODUCT_FIELDS = 'name slug price compareAtPrice images stock isActive';

/** Why a line cannot be bought right now, or null when it is fine. */
function lineIssue(product, quantity) {
  if (!product.isActive) return 'This product is no longer available';
  if (product.stock === 0) return 'Out of stock';
  if (product.stock < quantity) return `Only ${product.stock} left in stock`;
  return null;
}

/**
 * Loads MY cart (creating it if needed) and calculates everything on the server.
 * Returns the shape the frontend's cart page uses:
 *   { items: [{ product, quantity, lineTotal, issue }], itemCount, subtotal, shipping,
 *     total, hasIssues, freeShippingMin }
 */
export async function getCartWithTotals(userId) {
  // populate() replaces each product id with the product document (only PRODUCT_FIELDS)
  const cart = await Cart.forUser(userId).populate('items.product', PRODUCT_FIELDS);

  // A product that was DELETED from the database populates as null → drop that line
  // and save, so the cart heals itself.
  if (cart.items.some((i) => !i.product)) {
    cart.items = cart.items.filter((i) => i.product);
    await cart.save();
  }

  let subtotal = 0; // sum of the lines that CAN be bought
  let itemCount = 0; // pieces that can be bought
  const items = cart.items.map(({ product: p, quantity }) => {
    const issue = lineIssue(p, quantity);
    // The price comes from the DATABASE, right now. Whole rupees × whole pieces = whole rupees.
    const lineTotal = p.price * quantity;
    if (!issue) {
      // Lines with an issue are shown but NOT charged
      subtotal += lineTotal;
      itemCount += quantity;
    }
    return {
      product: {
        _id: p._id,
        name: p.name,
        slug: p.slug,
        price: p.price,
        compareAtPrice: p.compareAtPrice,
        image: p.images[0]?.url, // first image as the thumbnail (`?.` = no crash if none)
        stock: p.stock,
        isActive: p.isActive,
      },
      quantity,
      lineTotal,
      issue,
    };
  });

  const shipping = calcShipping(subtotal); // BR-02: Rs 250, free from Rs 5,000
  return {
    items,
    itemCount,
    subtotal,
    shipping,
    total: subtotal + shipping,
    hasIssues: items.some((i) => i.issue), // true → the UI disables "Checkout"
    freeShippingMin: PRICING.FREE_SHIPPING_MIN, // lets the UI say "Rs X more for free delivery"
  };
}

/** The product must exist AND be active (customers cannot buy hidden products). */
async function loadActiveProduct(productId) {
  const product = await Product.findOne({ _id: productId, isActive: true }).select('stock name');
  // Same 404 for "never existed" and "switched off": the customer cannot buy either one
  if (!product) throw new ApiError(404, 'Product not found');
  return product;
}

/** BR-04: at most 10 per product and never more than the stock. */
function checkQuantity(product, quantity) {
  if (quantity > LIMITS.MAX_CART_QTY) {
    throw new ApiError(400, `You can buy at most ${LIMITS.MAX_CART_QTY} of one product`);
  }
  if (product.stock === 0) throw new ApiError(400, `${product.name} is out of stock`);
  if (quantity > product.stock) {
    throw new ApiError(400, `Only ${product.stock} of ${product.name} left in stock`);
  }
}

// Finds the cart line of one product. String() because ids are objects: two ObjectIds with
// the same value are still two different objects, so `===` would say "not equal".
const findLine = (cart, productId) => cart.items.find((i) => String(i.product) === productId);

/** Put a product in MY cart. Already there → the quantities are ADDED (2 + 3 = 5). */
export async function addItem(userId, productId, quantity) {
  const product = await loadActiveProduct(productId);
  const cart = await Cart.forUser(userId);
  const line = findLine(cart, String(productId));
  const newQty = (line?.quantity || 0) + quantity; // the TOTAL must respect the limits
  checkQuantity(product, newQty);

  if (line) line.quantity = newQty;
  else cart.items.push({ product: productId, quantity }); // a new embedded line
  await cart.save(); // runs the schema validators (1–10, whole number, no duplicates)
  return getCartWithTotals(userId);
}

/** Set the quantity of a line that is already in MY cart (the +/- buttons). */
export async function updateItem(userId, productId, quantity) {
  const product = await loadActiveProduct(productId);
  const cart = await Cart.forUser(userId);
  const line = findLine(cart, String(productId));
  if (!line) throw new ApiError(404, 'Item not in cart');
  checkQuantity(product, quantity); // here the new quantity REPLACES the old one
  line.quantity = quantity;
  await cart.save();
  return getCartWithTotals(userId);
}

/**
 * Remove one product from MY cart. `$pull` deletes matching lines in one atomic update.
 * Removing a product that is not in the cart is not an error: the result ("it is not in
 * my cart") is the same, so this DELETE is idempotent (safe to repeat).
 */
export async function removeItem(userId, productId) {
  await Cart.updateOne({ user: userId }, { $pull: { items: { product: productId } } });
  return getCartWithTotals(userId);
}

/** Empty MY cart (also used after a successful checkout in branch 07). */
export async function clearCart(userId) {
  await Cart.updateOne({ user: userId }, { $set: { items: [] } });
  return getCartWithTotals(userId);
}
