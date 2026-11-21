/**
 * INTEGRATION tests for what branch 07 adds to earlier modules' DELETE routes:
 * records that an order points at are only hidden/deactivated, never deleted, so order
 * history (and the admin's links from it) never points at a missing document.
 *  - DELETE /api/products/:id  → soft delete (isActive: false) when an order contains it (BR-10)
 *  - DELETE /api/coupons/:id   → deactivate when an order references it, even after its use
 *                                was given back by a cancellation (usedCount 0)
 */
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import {
  api,
  bearer,
  createAdmin,
  createUser,
  createProduct,
  createCoupon,
  createOrder,
  addToCart,
} from '../helpers/factories.js';
import { Product, Coupon, Cart } from '../../src/modules/models.js';

let adminAuth;
beforeAll(connectTestDB);
beforeEach(async () => {
  adminAuth = bearer(await createAdmin());
});
afterEach(clearTestDB);
afterAll(closeTestDB);

describe('DELETE /api/products/:id when orders contain the product', () => {
  it('hides the product instead of deleting it (softDeleted: true)', async () => {
    const customer = await createUser();
    const product = await createProduct();
    await createOrder(customer, { product, status: 'cancelled' }); // any status counts
    await addToCart(customer, product, 1);

    const res = await api().delete(`/api/products/${product._id}`).set('Authorization', adminAuth);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ softDeleted: true });

    const saved = await Product.findById(product._id);
    expect(saved).not.toBeNull();
    expect(saved.isActive).toBe(false);
    // Hidden from the shop like any inactive product
    expect((await api().get(`/api/products/${product.slug}`)).status).toBe(404);
    // The cart line stays; the cart flags it as unavailable instead (branch 05 rules)
    expect((await Cart.findOne({ user: customer._id })).items).toHaveLength(1);
  });

  it('still hard-deletes a product that no order contains', async () => {
    const product = await createProduct();
    await createOrder(await createUser()); // an order for ANOTHER product
    const res = await api().delete(`/api/products/${product._id}`).set('Authorization', adminAuth);
    expect(res.body.data).toEqual({ softDeleted: false });
    expect(await Product.exists({ _id: product._id })).toBeNull();
  });
});

describe('DELETE /api/coupons/:id when orders reference the coupon', () => {
  it('deactivates a coupon an order used, even with usedCount back at 0', async () => {
    const coupon = await createCoupon(); // usedCount 0 (e.g. the order was cancelled)
    await createOrder(await createUser(), {
      status: 'cancelled',
      coupon: {
        coupon: coupon._id,
        code: coupon.code,
        type: 'percentage',
        value: 10,
        discount: 100,
      },
    });

    const res = await api().delete(`/api/coupons/${coupon._id}`).set('Authorization', adminAuth);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ deactivated: true });
    const saved = await Coupon.findById(coupon._id);
    expect(saved.isActive).toBe(false);
  });

  it('still deletes a coupon that no order references', async () => {
    const coupon = await createCoupon();
    const res = await api().delete(`/api/coupons/${coupon._id}`).set('Authorization', adminAuth);
    expect(res.body.data).toEqual({ deactivated: false });
    expect(await Coupon.exists({ _id: coupon._id })).toBeNull();
  });
});
