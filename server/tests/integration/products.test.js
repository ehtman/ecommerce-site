/**
 * INTEGRATION tests for every /api/products route.
 *
 * Structure: public reads (list with filters/search/sort/pagination, brands, by slug), then
 * the admin writes (create, update, delete, remove image, stock), each with its 400/401/403/
 * 404/409 cases. Cloudinary is stubbed (see uploads.test.js) so we can check which image files
 * would have been deleted, without any network.
 */
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import {
  api,
  loggedIn,
  createAdmin,
  bearer,
  createCategory,
  createProduct,
  validProduct,
  fakeImage,
} from '../helpers/factories.js';
import { Product } from '../../src/modules/models.js';
import { cloudinaryClient } from '../../src/config/cloudinary.js';
import { LIMITS } from '../../src/config/constants.js';

const realCloudinary = { ...cloudinaryClient };
let destroyed; // publicIds the fake Cloudinary was asked to delete

let admin;
let adminAuth;
let customerAuth;

beforeAll(connectTestDB);
beforeEach(async () => {
  destroyed = [];
  cloudinaryClient.isConfigured = () => true;
  cloudinaryClient.destroy = async (publicId) => {
    destroyed.push(publicId);
  };
  admin = await createAdmin();
  adminAuth = bearer(admin);
  ({ auth: customerAuth } = await loggedIn());
});
afterEach(async () => {
  Object.assign(cloudinaryClient, realCloudinary);
  await clearTestDB();
});
afterAll(closeTestDB);

const list = (query = '') => api().get(`/api/products${query}`);
const names = (res) => res.body.data.map((p) => p.name);
const BAD_ID = '665f1c2e9b1e8a0012345678'; // a valid id that matches nothing

/* ====================== PUBLIC ====================== */

describe('GET /api/products (public list)', () => {
  it('lists active products only, newest first, with pagination meta', async () => {
    const category = (await createCategory())._id;
    await createProduct({ name: 'First', category });
    await createProduct({ name: 'Hidden', category, isActive: false });
    await createProduct({ name: 'Second', category });

    const res = await list();
    expect(res.status).toBe(200);
    expect(names(res)).toEqual(['Second', 'First']);
    expect(res.body.meta).toEqual({ page: 1, limit: 12, total: 2, pages: 1 });
  });

  it('returns product CARDS: no description, no stock history, no SKU', async () => {
    await createProduct();
    const [card] = (await list()).body.data;
    expect(card).toEqual(
      expect.objectContaining({ name: expect.any(String), slug: expect.any(String), price: 1000 }),
    );
    expect(card.description).toBeUndefined();
    expect(card.stockHistory).toBeUndefined();
    expect(card.sku).toBeUndefined();
  });

  it('works without a token (public) and ignores a customer token', async () => {
    await createProduct();
    const res = await list().set('Authorization', customerAuth);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('?isActive=false cannot reveal hidden products', async () => {
    await createProduct({ isActive: false });
    const res = await list('?isActive=false');
    expect(res.body.data).toEqual([]);
  });

  describe('pagination', () => {
    beforeEach(async () => {
      const category = (await createCategory())._id;
      for (let i = 1; i <= 5; i += 1) {
        await createProduct({ name: `Prod${i}`, category, price: i * 100 });
      }
    });

    it('cuts the sorted list into pages without overlap', async () => {
      const page1 = await list('?sort=price_asc&limit=2&page=1');
      const page2 = await list('?sort=price_asc&limit=2&page=2');
      const page3 = await list('?sort=price_asc&limit=2&page=3');
      expect(names(page1)).toEqual(['Prod1', 'Prod2']);
      expect(names(page2)).toEqual(['Prod3', 'Prod4']);
      expect(names(page3)).toEqual(['Prod5']);
      expect(page2.body.meta).toEqual({ page: 2, limit: 2, total: 5, pages: 3 });
    });

    it('a page after the end is simply empty', async () => {
      const res = await list('?limit=2&page=9');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.meta.total).toBe(5);
    });

    it('caps the page size at 48 and repairs nonsense values', async () => {
      expect((await list('?limit=1000')).body.meta.limit).toBe(48);
      expect((await list('?limit=abc&page=-3')).body.meta).toMatchObject({ page: 1, limit: 12 });
    });

    it('products with the SAME price never repeat across pages (tie-breaker)', async () => {
      await Product.updateMany({}, { price: 500 });
      const seen = [];
      for (let page = 1; page <= 3; page += 1) {
        seen.push(...names(await list(`?sort=price_asc&limit=2&page=${page}`)));
      }
      expect(seen.sort()).toEqual(['Prod1', 'Prod2', 'Prod3', 'Prod4', 'Prod5']);
    });
  });

  describe('sorting', () => {
    beforeEach(async () => {
      const category = (await createCategory())._id;
      await createProduct({ name: 'Cheap', category, price: 100, sold: 5, ratingAverage: 3 });
      await createProduct({ name: 'Mid', category, price: 500, sold: 50, ratingAverage: 4.8 });
      await createProduct({ name: 'Pricey', category, price: 900, sold: 1, ratingAverage: 4 });
    });

    it.each([
      ['newest', ['Pricey', 'Mid', 'Cheap']],
      ['price_asc', ['Cheap', 'Mid', 'Pricey']],
      ['price_desc', ['Pricey', 'Mid', 'Cheap']],
      ['rating', ['Mid', 'Pricey', 'Cheap']],
      ['popular', ['Mid', 'Cheap', 'Pricey']],
      ['nonsense', ['Pricey', 'Mid', 'Cheap']], // unknown → newest
    ])('sort=%s', async (sort, expected) => {
      expect(names(await list(`?sort=${sort}`))).toEqual(expected);
    });
  });

  describe('filters', () => {
    let men;
    let shoes;
    beforeEach(async () => {
      men = await createCategory({ name: 'Men' });
      shoes = await createCategory({ name: 'Men Shoes', parent: men._id });
      const women = await createCategory({ name: 'Women' });
      await createProduct({
        name: 'Cotton Shirt',
        brand: 'Khaadi',
        category: men._id,
        price: 1500,
        ratingAverage: 4.5,
        isFeatured: true,
      });
      await createProduct({
        name: 'Running Sneakers',
        brand: 'Nike',
        category: shoes._id,
        price: 8000,
        stock: 0,
        ratingAverage: 3.9,
      });
      await createProduct({
        name: 'Silk Dress',
        brand: 'Khaadi',
        category: women._id,
        price: 5000,
        description: 'An elegant silk dress made with care, perfect for weddings.',
      });
    });

    it('category=<slug> includes its sub-categories', async () => {
      const res = await list(`?category=${men.slug}`);
      expect(names(res).sort()).toEqual(['Cotton Shirt', 'Running Sneakers']);
      expect(names(await list(`?category=${shoes.slug}`))).toEqual(['Running Sneakers']);
    });

    it('an unknown or inactive category gives an empty list (not an error)', async () => {
      expect((await list('?category=does-not-exist')).body.data).toEqual([]);
      men.isActive = false;
      await men.save();
      expect((await list(`?category=${men.slug}`)).body.data).toEqual([]);
    });

    it('price range (inclusive)', async () => {
      expect(names(await list('?minPrice=1500&maxPrice=5000')).sort()).toEqual([
        'Cotton Shirt',
        'Silk Dress',
      ]);
      expect(names(await list('?maxPrice=1499'))).toEqual([]);
    });

    it('rating = minimum average', async () => {
      expect(names(await list('?rating=4'))).toEqual(['Cotton Shirt']);
    });

    it('inStock=true hides sold-out products', async () => {
      expect(names(await list('?inStock=true'))).not.toContain('Running Sneakers');
      expect((await list('?inStock=true')).body.meta.total).toBe(2);
    });

    it('isFeatured=true', async () => {
      expect(names(await list('?isFeatured=true'))).toEqual(['Cotton Shirt']);
    });

    it('brand is exact and case-insensitive', async () => {
      expect(names(await list('?brand=khaadi')).sort()).toEqual(['Cotton Shirt', 'Silk Dress']);
      expect((await list('?brand=Khaa')).body.data).toEqual([]);
      expect((await list('?brand=.*')).body.data).toEqual([]); // regex characters are literal
    });

    it('filters combine (AND)', async () => {
      expect(names(await list('?brand=Khaadi&maxPrice=2000'))).toEqual(['Cotton Shirt']);
    });

    it('keyword uses the text index: name, brand and description, word stems', async () => {
      expect(names(await list('?keyword=shirts'))).toEqual(['Cotton Shirt']); // "shirts" → shirt
      expect(names(await list('?keyword=nike'))).toEqual(['Running Sneakers']); // brand
      expect(names(await list('?keyword=weddings'))).toEqual(['Silk Dress']); // description
      expect((await list('?keyword=laptop')).body.data).toEqual([]);
    });

    it('keyword works together with other filters and pagination', async () => {
      const res = await list('?keyword=khaadi&maxPrice=2000&limit=1');
      expect(names(res)).toEqual(['Cotton Shirt']);
      expect(res.body.meta).toMatchObject({ total: 1, pages: 1 });
    });

    it('a keyword never finds inactive products', async () => {
      await Product.updateOne({ name: 'Silk Dress' }, { isActive: false });
      expect((await list('?keyword=silk')).body.data).toEqual([]);
    });
  });
});

describe('GET /api/products/brands', () => {
  it('every brand of an active product, once, A→Z', async () => {
    const category = (await createCategory())._id;
    await createProduct({ brand: 'Nike', category });
    await createProduct({ brand: 'Adidas', category });
    await createProduct({ brand: 'Nike', category });
    await createProduct({ brand: 'Hidden', category, isActive: false });
    await createProduct({ brand: '', category });
    const res = await api().get('/api/products/brands');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(['Adidas', 'Nike']);
  });
});

describe('GET /api/products/:slug', () => {
  it('returns the full product with its category and computed fields', async () => {
    const category = await createCategory({ name: 'Shirts' });
    const p = await createProduct({
      name: 'Blue Shirt',
      category: category._id,
      compareAtPrice: 1250,
    });
    const res = await api().get(`/api/products/${p.slug}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      name: 'Blue Shirt',
      slug: 'blue-shirt',
      description: expect.any(String),
      category: { _id: String(category._id), name: 'Shirts', slug: 'shirts' },
      inStock: true,
      discountPercent: 20,
    });
    expect(res.body.data.stockHistory).toBeUndefined();
  });

  it('404 for an inactive product (same answer as missing)', async () => {
    const p = await createProduct({ isActive: false });
    const res = await api().get(`/api/products/${p.slug}`);
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Product not found');
  });

  it('404 for an unknown slug', async () => {
    expect((await api().get('/api/products/nope')).status).toBe(404);
  });
});

/* ====================== ADMIN ====================== */

describe('POST /api/products', () => {
  let category;
  beforeEach(async () => {
    category = (await createCategory())._id;
  });
  const create = (body, auth = adminAuth) =>
    api().post('/api/products').set('Authorization', auth).send(body);

  it('creates a product → 201 with slug, upper-case SKU and the admin as creator', async () => {
    const res = await create(
      validProduct(category, { name: 'Blue Cotton Shirt', sku: 'shirt-blu-m', stock: 7 }),
    );
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      name: 'Blue Cotton Shirt',
      slug: 'blue-cotton-shirt',
      sku: 'SHIRT-BLU-M',
      stock: 7,
      isActive: true,
      createdBy: String(admin._id),
    });
    expect(res.body.data.images[0]._id).toBeDefined();
  });

  it('stock defaults to 0; numeric strings are converted', async () => {
    const { stock: _s, ...body } = validProduct(category, { price: '1500' });
    const res = await create(body);
    expect(res.status).toBe(201);
    expect(res.body.data.stock).toBe(0);
    expect(res.body.data.price).toBe(1500);
  });

  it('ignores fields the client must not set (mass assignment)', async () => {
    const res = await create(
      validProduct(category, {
        slug: 'my-own-slug',
        sold: 999,
        ratingAverage: 5,
        ratingCount: 100,
        createdBy: BAD_ID,
        stockHistory: [{ change: 5, reason: 'fake', by: BAD_ID }],
        images: [{ ...fakeImage('x'), _id: BAD_ID, extra: 'dropped' }],
      }),
    );
    expect(res.status).toBe(201);
    const saved = await Product.findById(res.body.data._id).select('+stockHistory').lean();
    expect(saved.slug).not.toBe('my-own-slug');
    expect(saved).toMatchObject({ sold: 0, ratingAverage: 0, ratingCount: 0 });
    expect(String(saved.createdBy)).toBe(String(admin._id));
    expect(saved.stockHistory).toEqual([]);
    expect(String(saved.images[0]._id)).not.toBe(BAD_ID);
    expect(saved.images[0].extra).toBeUndefined();
  });

  it('the same name twice gets a different slug (slugs never collide)', async () => {
    const a = await create(validProduct(category, { name: 'Mug' }));
    const b = await create(validProduct(category, { name: 'Mug' }));
    expect([a.body.data.slug, b.body.data.slug]).toEqual(['mug', 'mug-2']);
  });

  it('409 when the SKU is already used (case-insensitive)', async () => {
    await create(validProduct(category, { sku: 'DUP-1' }));
    const res = await create(validProduct(category, { sku: 'dup-1' }));
    expect(res.status).toBe(409);
    expect(res.body.errors).toEqual([
      { field: 'sku', message: 'A product with this SKU already exists' },
    ]);
  });

  it('400 when the category does not exist', async () => {
    const res = await create(validProduct(BAD_ID));
    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toEqual({ field: 'category', message: 'Category not found' });
  });

  it.each([
    ['name', { name: 'ab' }],
    ['name', { name: undefined }],
    ['description', { description: 'short' }],
    ['brand', { brand: 'b'.repeat(51) }],
    ['sku', { sku: 'a b' }],
    ['sku', { sku: undefined }],
    ['price', { price: 0 }],
    ['price', { price: 10.5 }],
    ['price', { price: 'abc' }],
    ['compareAtPrice', { price: 1000, compareAtPrice: 900 }],
    ['compareAtPrice', { compareAtPrice: 1.5 }],
    ['compareAtPrice', { compareAtPrice: 99_999_999 }],
    ['category', { category: 'abc' }],
    ['stock', { stock: -1 }],
    ['stock', { stock: 2.5 }],
    ['images', { images: [] }],
    ['images', { images: 'not-an-array' }],
    ['images', { images: [1, 2, 3, 4, 5, 6].map((n) => fakeImage(`i${n}`)) }],
    ['images[0].url', { images: [{ url: 'https://evil.example/a.jpg', publicId: 'x' }] }],
    ['images[0].publicId', { images: [{ url: fakeImage().url, publicId: '' }] }],
    ['specifications', { specifications: Array(21).fill({ key: 'k', value: 'v' }) }],
    ['specifications[0].key', { specifications: [{ key: '', value: 'v' }] }],
    ['specifications[0].value', { specifications: [{ key: 'k' }] }],
    ['isFeatured', { isFeatured: 'maybe' }],
    ['isActive', { isActive: 'maybe' }],
  ])('400 for a bad %s', async (field, override) => {
    const res = await create(validProduct(category, override));
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e) => e.field)).toContain(field);
  });

  it('accepts "" for compareAtPrice (no discount)', async () => {
    const res = await create(validProduct(category, { compareAtPrice: '' }));
    expect(res.status).toBe(201);
    expect(res.body.data.compareAtPrice).toBeUndefined();
  });

  it('401 without a token', async () => {
    expect((await api().post('/api/products').send(validProduct(category))).status).toBe(401);
  });

  it('403 for a customer', async () => {
    const res = await create(validProduct(category), customerAuth);
    expect(res.status).toBe(403);
    expect(await Product.countDocuments()).toBe(0);
  });
});

describe('PUT /api/products/:id', () => {
  let product;
  beforeEach(async () => {
    product = await createProduct({
      name: 'Original',
      stock: 9,
      compareAtPrice: 1500,
      images: [fakeImage('keep'), fakeImage('drop')],
    });
  });
  const update = (id, body, auth = adminAuth) =>
    api().put(`/api/products/${id}`).set('Authorization', auth).send(body);
  const fullBody = (overrides = {}) =>
    validProduct(product.category, {
      name: product.name,
      sku: product.sku,
      images: [fakeImage('keep'), fakeImage('drop')],
      compareAtPrice: 1500,
      ...overrides,
    });

  it('replaces the fields; renaming changes the slug', async () => {
    const res = await update(
      product._id,
      fullBody({ name: 'Renamed', price: 1200, isActive: false }),
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      name: 'Renamed',
      slug: 'renamed',
      price: 1200,
      isActive: false,
    });
  });

  it('does NOT change stock (that is PATCH /:id/stock)', async () => {
    const res = await update(product._id, fullBody({ stock: 500 }));
    expect(res.status).toBe(200);
    expect(res.body.data.stock).toBe(9);
  });

  it('removes compareAtPrice when it is not sent, "" or null', async () => {
    for (const compareAtPrice of [undefined, '', null]) {
      await Product.updateOne({ _id: product._id }, { compareAtPrice: 1500 });
      const res = await update(product._id, fullBody({ compareAtPrice }));
      expect(res.status).toBe(200);
      expect(res.body.data.compareAtPrice).toBeUndefined();
    }
  });

  it('deletes the removed images from Cloudinary, keeps the others', async () => {
    const res = await update(
      product._id,
      fullBody({ images: [fakeImage('keep'), fakeImage('new')] }),
    );
    expect(res.status).toBe(200);
    expect(destroyed).toEqual(['shopease/products/drop']);
  });

  it('keeping its own SKU is fine; another product’s SKU → 409', async () => {
    expect((await update(product._id, fullBody())).status).toBe(200);
    const other = await createProduct({ sku: 'TAKEN-1' });
    const res = await update(product._id, fullBody({ sku: 'taken-1' }));
    expect(res.status).toBe(409);
    expect(other.sku).toBe('TAKEN-1');
  });

  it('400 when the new category does not exist', async () => {
    const res = await update(product._id, fullBody({ category: BAD_ID }));
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Category not found');
  });

  it('400 for an invalid body (the whole product is required)', async () => {
    const res = await update(product._id, { name: 'Only a name' });
    expect(res.status).toBe(400);
    expect(destroyed).toEqual([]);
  });

  it('400 for a malformed id', async () => {
    expect((await update('abc', fullBody())).status).toBe(400);
  });

  it('404 for an unknown id', async () => {
    expect((await update(BAD_ID, fullBody())).status).toBe(404);
  });

  it('401 without a token / 403 for a customer', async () => {
    expect((await api().put(`/api/products/${product._id}`).send(fullBody())).status).toBe(401);
    expect((await update(product._id, fullBody({ name: 'Hacked' }), customerAuth)).status).toBe(
      403,
    );
    expect((await Product.findById(product._id)).name).toBe('Original');
  });
});

describe('DELETE /api/products/:id', () => {
  const remove = (id, auth = adminAuth) =>
    api().delete(`/api/products/${id}`).set('Authorization', auth);

  it('deletes the product and all its images', async () => {
    const p = await createProduct({ images: [fakeImage('a'), fakeImage('b')] });
    const res = await remove(p._id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ message: 'Product deleted', data: { softDeleted: false } });
    expect(await Product.exists({ _id: p._id })).toBeNull();
    expect(destroyed.sort()).toEqual(['shopease/products/a', 'shopease/products/b']);
    expect((await api().get(`/api/products/${p.slug}`)).status).toBe(404);
  });

  it('still deletes when Cloudinary is down (image cleanup never fails the request)', async () => {
    cloudinaryClient.destroy = async () => {
      throw new Error('offline');
    };
    const p = await createProduct();
    expect((await remove(p._id)).status).toBe(200);
  });

  it('400 malformed id, 404 unknown id', async () => {
    expect((await remove('abc')).status).toBe(400);
    expect((await remove(BAD_ID)).status).toBe(404);
  });

  it('401 without a token / 403 for a customer', async () => {
    const p = await createProduct();
    expect((await api().delete(`/api/products/${p._id}`)).status).toBe(401);
    expect((await remove(p._id, customerAuth)).status).toBe(403);
    expect(await Product.exists({ _id: p._id })).not.toBeNull();
  });
});

describe('DELETE /api/products/:id/images/:imageId', () => {
  const removeImage = (id, imageId, auth = adminAuth) =>
    api().delete(`/api/products/${id}/images/${imageId}`).set('Authorization', auth);

  it('removes one image and deletes its file', async () => {
    const p = await createProduct({ images: [fakeImage('a'), fakeImage('b')] });
    const res = await removeImage(p._id, p.images[1]._id);
    expect(res.status).toBe(200);
    expect(res.body.data.images.map((i) => i.publicId)).toEqual(['shopease/products/a']);
    expect(destroyed).toEqual(['shopease/products/b']);
  });

  it('400 when it is the last image', async () => {
    const p = await createProduct();
    const res = await removeImage(p._id, p.images[0]._id);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('A product needs at least one image');
    expect(destroyed).toEqual([]);
  });

  it('404 for an unknown image or product', async () => {
    const p = await createProduct();
    expect((await removeImage(p._id, BAD_ID)).body.message).toBe('Image not found');
    expect((await removeImage(BAD_ID, BAD_ID)).body.message).toBe('Product not found');
  });

  it('400 when either id is malformed', async () => {
    const p = await createProduct();
    const res = await removeImage(p._id, 'abc');
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('imageId');
    expect((await removeImage('abc', p.images[0]._id)).status).toBe(400);
  });

  it('401 / 403', async () => {
    const p = await createProduct({ images: [fakeImage('a'), fakeImage('b')] });
    expect((await api().delete(`/api/products/${p._id}/images/${p.images[0]._id}`)).status).toBe(
      401,
    );
    expect((await removeImage(p._id, p.images[0]._id, customerAuth)).status).toBe(403);
  });
});

describe('PATCH /api/products/:id/stock', () => {
  let product;
  beforeEach(async () => {
    product = await createProduct({ stock: 10 });
  });
  const patch = (body, id = product._id, auth = adminAuth) =>
    api().patch(`/api/products/${id}/stock`).set('Authorization', auth).send(body);

  it('adjust adds or subtracts, and records history', async () => {
    let res = await patch({ mode: 'adjust', value: 5, reason: 'New delivery' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ _id: String(product._id), stock: 15 });
    res = await patch({ mode: 'adjust', value: -3, reason: 'Damaged' });
    expect(res.body.data.stock).toBe(12);

    const saved = await Product.findById(product._id).select('+stockHistory');
    expect(saved.stockHistory.map((h) => [h.change, h.reason])).toEqual([
      [5, 'New delivery'],
      [-3, 'Damaged'],
    ]);
    expect(String(saved.stockHistory[0].by)).toBe(String(admin._id));
  });

  it('set changes the total and stores the difference', async () => {
    const res = await patch({ mode: 'set', value: 4, reason: 'Shelf count' });
    expect(res.body.data.stock).toBe(4);
    const saved = await Product.findById(product._id).select('+stockHistory');
    expect(saved.stockHistory[0].change).toBe(-6);
  });

  it('400 when it would go below zero', async () => {
    const res = await patch({ mode: 'adjust', value: -11, reason: 'Too many' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Stock cannot go below zero');
    expect((await Product.findById(product._id)).stock).toBe(10);
  });

  it('400 for a negative "set" or no change at all', async () => {
    expect((await patch({ mode: 'set', value: -1, reason: 'Oops' })).body.message).toBe(
      'Stock cannot be negative',
    );
    expect((await patch({ mode: 'set', value: 10, reason: 'Same' })).body.message).toBe(
      'Stock is already at this value',
    );
    expect((await patch({ mode: 'adjust', value: 0, reason: 'Zero' })).status).toBe(400);
  });

  it.each([
    ['mode', { mode: 'add', value: 1, reason: 'abc' }],
    ['value', { mode: 'adjust', value: 1.5, reason: 'abc' }],
    ['value', { mode: 'adjust', reason: 'abc' }],
    ['reason', { mode: 'adjust', value: 1, reason: 'ab' }],
    ['reason', { mode: 'adjust', value: 1 }],
  ])('400 for a bad %s', async (field, body) => {
    const res = await patch(body);
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe(field);
  });

  it('400 malformed id, 404 unknown id', async () => {
    const body = { mode: 'adjust', value: 1, reason: 'Delivery' };
    expect((await patch(body, 'abc')).status).toBe(400);
    expect((await patch(body, BAD_ID)).status).toBe(404);
  });

  it('401 / 403', async () => {
    const body = { mode: 'adjust', value: 1, reason: 'Delivery' };
    expect((await api().patch(`/api/products/${product._id}/stock`).send(body)).status).toBe(401);
    expect((await patch(body, product._id, customerAuth)).status).toBe(403);
    expect((await Product.findById(product._id)).stock).toBe(10);
  });

  it(`a product at or below ${LIMITS.LOW_STOCK_THRESHOLD} still shows in the shop`, async () => {
    await patch({ mode: 'set', value: 1, reason: 'Almost gone' });
    const res = await list();
    expect(res.body.data[0].stock).toBe(1);
  });
});
