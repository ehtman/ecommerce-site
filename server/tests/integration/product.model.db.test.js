/**
 * Product model behaviour that NEEDS the database: the slug hook, the unique indexes and the
 * atomic stock statics (reserveStock / releaseStock / adjustStock).
 *
 * The race test is the important one: it starts many "buy the last item" requests AT THE
 * SAME TIME and proves only one of them can win (no overselling).
 */
import mongoose from 'mongoose';
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import { createProduct, createCategory } from '../helpers/factories.js';
import { Product } from '../../src/modules/models.js';
import { LIMITS } from '../../src/config/constants.js';

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(closeTestDB);

describe('slug hook', () => {
  it('builds the slug from the name, adding -2, -3 for the same name', async () => {
    const category = (await createCategory())._id;
    const a = await createProduct({ name: 'Blue Mug!', category });
    const b = await createProduct({ name: 'Blue Mug', category });
    const c = await createProduct({ name: 'blue mug', category });
    expect([a.slug, b.slug, c.slug]).toEqual(['blue-mug', 'blue-mug-2', 'blue-mug-3']);
  });

  it('renaming changes the slug; other edits keep it', async () => {
    const p = await createProduct({ name: 'Old Name' });
    p.price = 1200;
    await p.save();
    expect(p.slug).toBe('old-name');
    p.name = 'New Name';
    await p.save();
    expect(p.slug).toBe('new-name');
  });
});

describe('unique indexes (the database is the last line of defence)', () => {
  it('refuses a second product with the same SKU, whatever its case', async () => {
    await createProduct({ sku: 'DUP-1' });
    await expect(createProduct({ sku: 'dup-1' })).rejects.toMatchObject({ code: 11000 });
  });

  it('refuses a duplicate slug written directly (bypassing the hook)', async () => {
    const p = await createProduct({ name: 'Same' });
    const other = await createProduct({ name: 'Other' });
    await expect(
      Product.collection.updateOne({ _id: other._id }, { $set: { slug: p.slug } }),
    ).rejects.toMatchObject({ code: 11000 });
  });
});

describe('reserveStock / releaseStock', () => {
  it('reserves when enough stock, increasing sold', async () => {
    const p = await createProduct({ stock: 5 });
    expect(await Product.reserveStock(p._id, 3)).toBe(true);
    const after = await Product.findById(p._id);
    expect(after.stock).toBe(2);
    expect(after.sold).toBe(3);
  });

  it('refuses when not enough stock, or the product is inactive', async () => {
    const p = await createProduct({ stock: 2 });
    expect(await Product.reserveStock(p._id, 3)).toBe(false);
    const off = await createProduct({ stock: 10, isActive: false });
    expect(await Product.reserveStock(off._id, 1)).toBe(false);
    expect((await Product.findById(p._id)).stock).toBe(2); // unchanged
  });

  it('never oversells: 10 shoppers race for the last 3 items', async () => {
    const p = await createProduct({ stock: 3 });
    const results = await Promise.all(
      Array.from({ length: 10 }, () => Product.reserveStock(p._id, 1)),
    );
    expect(results.filter(Boolean)).toHaveLength(3); // exactly 3 winners
    const after = await Product.findById(p._id);
    expect(after.stock).toBe(0);
    expect(after.sold).toBe(3);
  });

  it('releaseStock puts items back', async () => {
    const p = await createProduct({ stock: 5 });
    await Product.reserveStock(p._id, 2);
    await Product.releaseStock(p._id, 2);
    const after = await Product.findById(p._id);
    expect(after.stock).toBe(5);
    expect(after.sold).toBe(0);
  });

  it('works inside a transaction (rolled back on abort)', async () => {
    const p = await createProduct({ stock: 5 });
    await expect(
      mongoose.connection.transaction(async (session) => {
        await Product.reserveStock(p._id, 2, session);
        throw new Error('payment failed');
      }),
    ).rejects.toThrow('payment failed');
    expect((await Product.findById(p._id)).stock).toBe(5);
  });
});

describe('adjustStock', () => {
  const admin = new mongoose.Types.ObjectId();

  it('changes the stock and records who, why and how much', async () => {
    const p = await createProduct({ stock: 5 });
    const updated = await Product.adjustStock(p._id, 10, 'New delivery', admin);
    expect(updated.stock).toBe(15);
    const withHistory = await Product.findById(p._id).select('+stockHistory');
    expect(withHistory.stockHistory).toHaveLength(1);
    expect(withHistory.stockHistory[0]).toMatchObject({ change: 10, reason: 'New delivery' });
    expect(String(withHistory.stockHistory[0].by)).toBe(String(admin));
  });

  it('refuses to go below zero (returns null, nothing written)', async () => {
    const p = await createProduct({ stock: 2 });
    expect(await Product.adjustStock(p._id, -3, 'Damaged', admin)).toBeNull();
    const after = await Product.findById(p._id).select('+stockHistory');
    expect(after.stock).toBe(2);
    expect(after.stockHistory).toHaveLength(0);
  });

  it(`keeps only the last ${LIMITS.STOCK_HISTORY_KEEP} history entries`, async () => {
    const p = await createProduct({ stock: 0 });
    for (let i = 1; i <= LIMITS.STOCK_HISTORY_KEEP + 5; i += 1) {
      await Product.adjustStock(p._id, 1, `Delivery ${i}`, admin);
    }
    const after = await Product.findById(p._id).select('+stockHistory');
    expect(after.stock).toBe(LIMITS.STOCK_HISTORY_KEEP + 5);
    expect(after.stockHistory).toHaveLength(LIMITS.STOCK_HISTORY_KEEP);
    expect(after.stockHistory[0].reason).toBe('Delivery 6'); // the oldest 5 were dropped
  });

  it('stock history is not loaded by normal queries', async () => {
    const p = await createProduct();
    await Product.adjustStock(p._id, 1, 'Recount', admin);
    const plain = await Product.findById(p._id).lean();
    expect(plain.stockHistory).toBeUndefined();
  });
});
