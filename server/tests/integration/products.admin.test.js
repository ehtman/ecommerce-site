/**
 * INTEGRATION tests for the admin product READ handlers: adminList, lowStock and adminGet.
 *
 * In the reference app (and from branch 10) the admin module mounts them at
 *   GET /api/admin/products, /api/admin/products/low-stock, /api/admin/products/:id
 * Branch 10 doesn't exist yet, so this file mounts the SAME controllers on a tiny test app
 * with the same guards. When branch 10 arrives, its own tests call the real URLs.
 */
import express from 'express';
import request from 'supertest';
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import {
  loggedIn,
  createAdmin,
  bearer,
  createCategory,
  createProduct,
} from '../helpers/factories.js';
import { Product } from '../../src/modules/models.js';
import { protect, authorize } from '../../src/middleware/auth.middleware.js';
import { validateObjectId } from '../../src/middleware/validate.middleware.js';
import errorHandler from '../../src/middleware/error.middleware.js';
import * as c from '../../src/modules/products/product.controller.js';

// The routes branch 10 will add, on a throw-away app
const testApp = express();
const admin = [protect, authorize('admin')];
testApp.get('/admin/products', ...admin, c.adminList);
testApp.get('/admin/products/low-stock', ...admin, c.lowStock);
testApp.get('/admin/products/:id', ...admin, validateObjectId('id'), c.adminGet);
testApp.use(errorHandler);

let adminAuth;
let customerAuth;
let adminUser;

beforeAll(connectTestDB);
beforeEach(async () => {
  adminUser = await createAdmin({ name: 'Stock Keeper' });
  adminAuth = bearer(adminUser);
  ({ auth: customerAuth } = await loggedIn());
});
afterEach(clearTestDB);
afterAll(closeTestDB);

const get = (url, auth = adminAuth) => request(testApp).get(url).set('Authorization', auth);
const names = (res) => res.body.data.map((p) => p.name);

describe('adminList (GET /api/admin/products, branch 10)', () => {
  let shirts;
  beforeEach(async () => {
    shirts = await createCategory({ name: 'Shirts' });
    await createProduct({ name: 'Blue Shirt', sku: 'SHIRT-1', category: shirts._id, stock: 9 });
    await createProduct({
      name: 'Old Shirt',
      sku: 'SHIRT-2',
      category: shirts._id,
      isActive: false,
      stock: 1,
    });
    await createProduct({ name: 'Red Mug', sku: 'MUG-1', stock: 4 });
  });

  it('lists ALL products (active and inactive), newest first, with SKU and category name', async () => {
    const res = await get('/admin/products');
    expect(res.status).toBe(200);
    expect(names(res)).toEqual(['Red Mug', 'Old Shirt', 'Blue Shirt']);
    expect(res.body.data[1]).toMatchObject({ sku: 'SHIRT-2', isActive: false });
    expect(res.body.data[1].category.name).toBe('Shirts');
    expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 3, pages: 1 });
  });

  it('search matches name or SKU, ignoring case and treating text literally', async () => {
    expect(names(await get('/admin/products?search=shirt')).sort()).toEqual([
      'Blue Shirt',
      'Old Shirt',
    ]);
    expect(names(await get('/admin/products?search=mug-1'))).toEqual(['Red Mug']);
    expect((await get('/admin/products?search=.*')).body.data).toEqual([]);
  });

  it('filters by status and category id; ignores a malformed category', async () => {
    expect(names(await get('/admin/products?status=inactive'))).toEqual(['Old Shirt']);
    expect((await get('/admin/products?status=active')).body.meta.total).toBe(2);
    expect((await get(`/admin/products?category=${shirts._id}`)).body.meta.total).toBe(2);
    expect((await get('/admin/products?category=abc')).body.meta.total).toBe(3);
  });

  it('sort=stock shows the lowest stock first; pages up to 100', async () => {
    expect(names(await get('/admin/products?sort=stock'))).toEqual([
      'Old Shirt',
      'Red Mug',
      'Blue Shirt',
    ]);
    expect((await get('/admin/products?limit=500')).body.meta.limit).toBe(100);
  });

  it('403 for a customer, 401 without a token', async () => {
    expect((await get('/admin/products', customerAuth)).status).toBe(403);
    expect((await request(testApp).get('/admin/products')).status).toBe(401);
  });
});

describe('lowStock (GET /api/admin/products/low-stock, branch 10)', () => {
  it('active products with stock ≤ 5, lowest first', async () => {
    const category = (await createCategory())._id;
    await createProduct({ name: 'Five', stock: 5, category });
    await createProduct({ name: 'Zero', stock: 0, category });
    await createProduct({ name: 'Six', stock: 6, category });
    await createProduct({ name: 'Hidden', stock: 1, category, isActive: false });
    const res = await get('/admin/products/low-stock');
    expect(res.status).toBe(200);
    expect(names(res)).toEqual(['Zero', 'Five']);
  });
});

describe('adminGet (GET /api/admin/products/:id, branch 10)', () => {
  it('returns an inactive product with its stock history and who changed it', async () => {
    const p = await createProduct({ isActive: false });
    await Product.adjustStock(p._id, 3, 'Delivery', adminUser._id);
    const res = await get(`/admin/products/${p._id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);
    expect(res.body.data.stockHistory[0]).toMatchObject({
      change: 3,
      reason: 'Delivery',
      by: { _id: String(adminUser._id), name: 'Stock Keeper' },
    });
  });

  it('404 unknown id, 400 malformed id', async () => {
    expect((await get('/admin/products/665f1c2e9b1e8a0012345678')).status).toBe(404);
    expect((await get('/admin/products/abc')).status).toBe(400);
  });
});
