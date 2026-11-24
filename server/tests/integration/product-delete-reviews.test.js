/**
 * INTEGRATION tests for what branch 09 adds to DELETE /api/products/:id:
 * a product that is really deleted takes its reviews with it; a product kept because
 * orders contain it (soft delete, branch 07) keeps its reviews.
 */
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import {
  api,
  bearer,
  createAdmin,
  createUser,
  createProduct,
  createReview,
} from '../helpers/factories.js';
import { Review, Order } from '../../src/modules/models.js';

let adminAuth;
beforeAll(connectTestDB);
beforeEach(async () => {
  adminAuth = bearer(await createAdmin());
});
afterEach(clearTestDB);
afterAll(closeTestDB);

const remove = (id) => api().delete(`/api/products/${id}`).set('Authorization', adminAuth);

describe('DELETE /api/products/:id and reviews', () => {
  it('a hard delete removes every review of the product, and only those', async () => {
    const [doomed, kept] = await Promise.all([createProduct(), createProduct()]);
    const [ali, sara] = await Promise.all([createUser(), createUser()]);
    await createReview(ali, doomed);
    await createReview(sara, doomed);
    const other = await createReview(ali, kept);
    // createReview made delivered orders; without orders the product can be hard-deleted
    await Order.deleteMany({ 'items.product': doomed._id });

    const res = await remove(doomed._id);
    expect(res.body.data).toEqual({ softDeleted: false });
    expect(await Review.countDocuments({ product: doomed._id })).toBe(0);
    expect(await Review.exists({ _id: other._id })).not.toBeNull();
  });

  it('a soft delete (orders contain the product) keeps its reviews', async () => {
    const product = await createProduct();
    await createReview(await createUser(), product);
    const res = await remove(product._id);
    expect(res.body.data).toEqual({ softDeleted: true });
    expect(await Review.countDocuments({ product: product._id })).toBe(1);
  });
});
