/**
 * UNIT tests for the Cart and Wishlist schemas: their validators and virtuals.
 *
 * validateSync() runs the schema rules WITHOUT a database, so these tests are instant.
 * They prove the model is a real safety net, even for code that skips the service.
 */
import mongoose from 'mongoose';
import { Cart, Wishlist } from '../../src/modules/models.js';
import { LIMITS } from '../../src/config/constants.js';

const id = () => new mongoose.Types.ObjectId();
const cartWith = (items) => new Cart({ user: id(), items });

describe('Cart model', () => {
  it('accepts a valid cart and starts empty by default', () => {
    expect(cartWith([{ product: id(), quantity: 2 }]).validateSync()).toBeUndefined();
    expect(new Cart({ user: id() }).items).toHaveLength(0);
  });

  it('requires an owner', () => {
    expect(new Cart({}).validateSync().errors.user).toBeDefined();
  });

  it.each([
    [0, 'Quantity must be at least 1'],
    [LIMITS.MAX_CART_QTY + 1, `You can buy at most ${LIMITS.MAX_CART_QTY} of one product`],
    [1.5, 'Quantity must be a whole number'],
  ])('refuses quantity %p', (quantity, message) => {
    const err = cartWith([{ product: id(), quantity }]).validateSync();
    expect(err.errors['items.0.quantity'].message).toBe(message);
  });

  it('refuses the same product twice (one line per product)', () => {
    const product = id();
    const err = cartWith([
      { product, quantity: 1 },
      { product, quantity: 2 },
    ]).validateSync();
    expect(err.errors.items.message).toBe('Each product can appear only once in the cart');
  });

  it('itemCount is the total number of pieces (a virtual, not stored)', () => {
    const cart = cartWith([
      { product: id(), quantity: 2 },
      { product: id(), quantity: 3 },
    ]);
    expect(cart.itemCount).toBe(5);
    expect(cart.toJSON().__v).toBeUndefined(); // toJSON plugin applied
  });
});

describe('Wishlist model', () => {
  it('accepts up to the limit and refuses more', () => {
    const full = Array.from({ length: LIMITS.MAX_WISHLIST }, id);
    expect(new Wishlist({ user: id(), products: full }).validateSync()).toBeUndefined();

    const err = new Wishlist({ user: id(), products: [...full, id()] }).validateSync();
    expect(err.errors.products.message).toBe(
      `Wishlist can hold at most ${LIMITS.MAX_WISHLIST} products`,
    );
  });
});
