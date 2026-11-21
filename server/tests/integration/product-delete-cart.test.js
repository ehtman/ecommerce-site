/**
 * INTEGRATION tests for what branch 05 adds to DELETE /api/products/:id:
 * a deleted product disappears from every customer's cart and wishlist
 * (the other products in them stay untouched).
 */
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import {
  api,
  bearer,
  createAdmin,
  createUser,
  createProduct,
  addToCart,
  createWishlist,
} from '../helpers/factories.js';
import { Cart, Wishlist } from '../../src/modules/models.js';

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(closeTestDB);

const ids = (list) => list.map((x) => String(x));

describe('DELETE /api/products/:id cleans carts and wishlists', () => {
  it('pulls the product from every cart and wishlist, keeping the other products', async () => {
    const adminAuth = bearer(await createAdmin());
    const [ali, sara] = await Promise.all([createUser(), createUser()]);
    const doomed = await createProduct();
    const kept = await createProduct();
    await addToCart(ali, doomed, 2);
    await addToCart(ali, kept, 1);
    await addToCart(sara, doomed, 1);
    await createWishlist(ali, [doomed, kept]);
    await createWishlist(sara, [doomed]);

    const res = await api().delete(`/api/products/${doomed._id}`).set('Authorization', adminAuth);
    expect(res.status).toBe(200);

    const aliCart = await Cart.findOne({ user: ali._id });
    const saraCart = await Cart.findOne({ user: sara._id });
    expect(ids(aliCart.items.map((i) => i.product))).toEqual([String(kept._id)]);
    expect(saraCart.items).toHaveLength(0);

    const aliList = await Wishlist.findOne({ user: ali._id });
    const saraList = await Wishlist.findOne({ user: sara._id });
    expect(ids(aliList.products)).toEqual([String(kept._id)]);
    expect(saraList.products).toHaveLength(0);
  });

  it('a refused delete (customer, 403) leaves carts and wishlists alone', async () => {
    const customer = await createUser();
    const product = await createProduct();
    await addToCart(customer, product, 1);
    await createWishlist(customer, [product]);

    const res = await api()
      .delete(`/api/products/${product._id}`)
      .set('Authorization', bearer(customer));
    expect(res.status).toBe(403);
    expect((await Cart.findOne({ user: customer._id })).items).toHaveLength(1);
    expect((await Wishlist.findOne({ user: customer._id })).products).toHaveLength(1);
  });
});
