/**
 * INTEGRATION test for the store seed script (src/db/scripts/seed.js).
 *
 * The key property of a seed is IDEMPOTENCY: running it twice must leave exactly the same
 * data as running it once (no duplicates, no errors), and must not overwrite admin edits.
 */
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import { api, createUser } from '../helpers/factories.js';
import { seedStore, PRODUCTS, MAIN_CATEGORIES, SUB_CATEGORIES } from '../../src/db/scripts/seed.js';
import { User, Category, Product, Coupon } from '../../src/modules/models.js';

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(closeTestDB);

const counts = async () => ({
  admins: await User.countDocuments({ role: 'admin' }),
  categories: await Category.countDocuments(),
  products: await Product.countDocuments(),
  coupons: await Coupon.countDocuments(),
});

describe('seedStore()', () => {
  it('creates the admin, 14 categories, 30 products and 2 coupons', async () => {
    const created = await seedStore();
    expect(created).toEqual({ admin: true, categories: 14, products: 30, coupons: 2 });
    expect(MAIN_CATEGORIES.length + Object.keys(SUB_CATEGORIES).length).toBe(14);
    expect(PRODUCTS).toHaveLength(30);
    expect(await counts()).toEqual({ admins: 1, categories: 14, products: 30, coupons: 2 });

    // Two levels: "Audio" sits under "Electronics"
    const audio = await Category.findOne({ name: 'Audio' }).populate('parent');
    expect(audio.parent.name).toBe('Electronics');
    // Every product has a Cloudinary demo image and belongs to a category
    const products = await Product.find();
    products.forEach((p) => {
      expect(p.images[0].url).toMatch(/^https:\/\/res\.cloudinary\.com\/demo\/image\/upload\//);
      expect(p.category).toBeDefined();
    });
    expect(await Coupon.findOne({ code: 'WELCOME10' })).toMatchObject({
      type: 'percentage',
      value: 10,
    });
  });

  it('is idempotent: a second run creates nothing and keeps the same counts', async () => {
    await seedStore();
    const before = await counts();
    const second = await seedStore();
    expect(second).toEqual({ admin: false, categories: 0, products: 0, coupons: 0 });
    expect(await counts()).toEqual(before);
  });

  it('never overwrites changes made after the first run', async () => {
    await seedStore();
    await Product.updateOne({ sku: 'SM-HP-100' }, { price: 7777 });
    await seedStore();
    expect((await Product.findOne({ sku: 'SM-HP-100' })).price).toBe(7777);
  });

  it('the seeded admin can log in through the admin login', async () => {
    await seedStore();
    const res = await api()
      .post('/api/auth/admin/login')
      .send({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('admin');
  });

  it('refuses to promote an existing CUSTOMER with the admin email', async () => {
    await createUser({ email: process.env.ADMIN_EMAIL });
    await expect(seedStore()).rejects.toThrow(/belongs to a CUSTOMER/);
    expect(await User.countDocuments({ role: 'admin' })).toBe(0);
  });
});
