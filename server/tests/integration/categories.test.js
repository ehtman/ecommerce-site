/**
 * INTEGRATION tests for /api/categories.
 *
 * Key promises:
 *  - PUBLIC reads (no token): only ACTIVE categories; an inactive one is a 404 like a missing one
 *  - ADMIN-only writes: 401 without a token, 403 for customers
 *  - slugs are generated from the name, unique, and follow renames
 *  - names are unique ignoring case → 409
 *  - at most two levels (parent must be top-level, no self-parent, parents can't become children)
 *  - a category with sub-categories cannot be deleted
 *  - slug, _id and other unknown fields in the body are ignored (mass assignment)
 */
import mongoose from 'mongoose';
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import { api, loggedIn, bearer, createAdmin, createCategory } from '../helpers/factories.js';
import { Category } from '../../src/modules/models.js';

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(closeTestDB);

const image = {
  url: 'https://res.cloudinary.com/demo/image/upload/v1/shopease/categories/shoes.jpg',
  publicId: 'shopease/categories/shoes',
};

// Short request helpers: each test reads like a sentence
const list = () => api().get('/api/categories');
const getBySlug = (slug) => api().get(`/api/categories/${slug}`);
const create = (auth, body) => api().post('/api/categories').set('Authorization', auth).send(body);
const update = (auth, id, body) =>
  api().put(`/api/categories/${id}`).set('Authorization', auth).send(body);
const remove = (auth, id) => api().delete(`/api/categories/${id}`).set('Authorization', auth);

// A valid id that belongs to no document
const missingId = () => new mongoose.Types.ObjectId().toString();
// An admin's Authorization header
const adminAuth = async () => bearer(await createAdmin());

describe('Access control (admin routes)', () => {
  const routes = [
    ['POST', (r) => r.post('/api/categories').send({ name: 'Shoes' })],
    ['PUT', (r) => r.put(`/api/categories/${missingId()}`).send({ name: 'Shoes' })],
    ['DELETE', (r) => r.delete(`/api/categories/${missingId()}`)],
  ];

  it.each(routes)('%s returns 401 without a token', async (_name, send) => {
    const res = await send(api());
    expect(res.status).toBe(401);
  });

  it.each(routes)('%s returns 401 with a forged token', async (_name, send) => {
    const res = await send(api()).set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(401);
  });

  it.each(routes)('%s returns 403 for a customer', async (_name, send) => {
    const { auth } = await loggedIn();
    const res = await send(api()).set('Authorization', auth);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Access denied');
  });

  it('a customer cannot create a category (nothing is saved)', async () => {
    const { auth } = await loggedIn();
    await create(auth, { name: 'Sneaky' });
    expect(await Category.countDocuments()).toBe(0);
  });

  it('public routes need no token', async () => {
    const category = await createCategory({ name: 'Shoes' });
    expect((await list()).status).toBe(200);
    expect((await getBySlug(category.slug)).status).toBe(200);
  });
});

describe('GET /api/categories (public)', () => {
  it('returns an empty list when there are no categories', async () => {
    const res = await list();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, message: 'Categories fetched', data: [] });
  });

  it('lists only ACTIVE categories, by sortOrder and then name', async () => {
    await createCategory({ name: 'Zebra', sortOrder: 0 });
    await createCategory({ name: 'Apple', sortOrder: 0 });
    await createCategory({ name: 'First', sortOrder: 0 });
    await createCategory({ name: 'Last', sortOrder: 10 });
    await createCategory({ name: 'Hidden', isActive: false });

    const res = await list();
    expect(res.body.data.map((c) => c.name)).toEqual(['Apple', 'First', 'Zebra', 'Last']);
    expect(res.body.data[0].__v).toBeUndefined(); // the toJSON plugin cleans the output
  });

  it('includes sub-categories with their parent id (a flat list)', async () => {
    const men = await createCategory({ name: 'Men' });
    await createCategory({ name: 'Shoes', parent: men._id });
    const res = await list();
    const shoes = res.body.data.find((c) => c.name === 'Shoes');
    expect(shoes.parent).toBe(String(men._id));
  });
});

describe('GET /api/categories/:slug (public)', () => {
  it('returns an active category by its slug', async () => {
    await createCategory({ name: "Men's Shoes", description: 'All shoes', image });
    const res = await getBySlug('mens-shoes');
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Category fetched');
    expect(res.body.data).toMatchObject({
      name: "Men's Shoes",
      slug: 'mens-shoes',
      description: 'All shoes',
      image,
      isActive: true,
    });
  });

  it('returns 404 for an INACTIVE category (hidden from the public)', async () => {
    await createCategory({ name: 'Old Stuff', isActive: false });
    const res = await getBySlug('old-stuff');
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Category not found');
  });

  it('returns 404 for an unknown slug', async () => {
    expect((await getBySlug('does-not-exist')).status).toBe(404);
  });

  it('an upper-case slug in the URL still finds the category', async () => {
    // The schema says `slug: { lowercase: true }`, and Mongoose applies that to QUERY
    // values too, so /api/categories/Shoes looks for "shoes".
    await createCategory({ name: 'Shoes' });
    const res = await getBySlug('Shoes');
    expect(res.status).toBe(200);
    expect(res.body.data.slug).toBe('shoes');
  });
});

describe('POST /api/categories (admin)', () => {
  it('creates a top-level category with a generated slug and defaults', async () => {
    const res = await create(await adminAuth(), { name: '  Home & Kitchen  ' });
    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Category created');
    expect(res.body.data).toMatchObject({
      name: 'Home & Kitchen',
      slug: 'home-kitchen',
      description: '',
      parent: null,
      isActive: true,
      sortOrder: 0,
    });
    expect(res.body.data.image).toBeUndefined();
  });

  it('creates a sub-category under a top-level parent', async () => {
    const men = await createCategory({ name: 'Men' });
    const res = await create(await adminAuth(), { name: 'Shoes', parent: String(men._id) });
    expect(res.status).toBe(201);
    expect(res.body.data.parent).toBe(String(men._id));
  });

  it('stores every optional field (image, description, isActive, sortOrder)', async () => {
    const res = await create(await adminAuth(), {
      name: 'Shoes',
      description: 'Every shoe',
      image,
      isActive: 'false', // strings from HTML forms are converted
      sortOrder: '5',
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      description: 'Every shoe',
      image,
      isActive: false,
      sortOrder: 5,
    });
  });

  it('treats an empty parent ("") as top-level', async () => {
    const res = await create(await adminAuth(), { name: 'Shoes', parent: '' });
    expect(res.status).toBe(201);
    expect(res.body.data.parent).toBeNull();
  });

  it('IGNORES slug, _id and unknown fields in the body (mass assignment)', async () => {
    const id = missingId();
    const res = await create(await adminAuth(), {
      name: 'Shoes',
      slug: 'free-money',
      _id: id,
      productCount: 99,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.slug).toBe('shoes');
    expect(res.body.data._id).not.toBe(id);
    expect(res.body.data.productCount).toBeUndefined();
  });

  describe('slug uniqueness', () => {
    it('different names with the same slug get -2, -3 …', async () => {
      const auth = await adminAuth();
      const a = await create(auth, { name: "Men's Wear" });
      const b = await create(auth, { name: 'Mens Wear' });
      const c = await create(auth, { name: 'Mens-Wear!' });
      expect([a, b, c].map((r) => r.body.data.slug)).toEqual([
        'mens-wear',
        'mens-wear-2',
        'mens-wear-3',
      ]);
    });

    it('a name without URL-friendly characters gets the fallback slug "item"', async () => {
      const res = await create(await adminAuth(), { name: 'کپڑے' }); // Urdu for "clothes"
      expect(res.status).toBe(201);
      expect(res.body.data.slug).toBe('item');
    });

    it('accented letters are simplified: "Café Crème" → "cafe-creme"', async () => {
      const res = await create(await adminAuth(), { name: 'Café Crème' });
      expect(res.body.data.slug).toBe('cafe-creme');
    });
  });

  describe('409 duplicate name', () => {
    it('refuses the same name', async () => {
      await createCategory({ name: 'Shoes' });
      const res = await create(await adminAuth(), { name: 'Shoes' });
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({
        message: 'A category with this name already exists',
        errors: [{ field: 'name' }],
      });
    });

    it('refuses the same name in a different case or with spaces', async () => {
      await createCategory({ name: 'Shoes' });
      const auth = await adminAuth();
      expect((await create(auth, { name: 'SHOES' })).status).toBe(409);
      expect((await create(auth, { name: '  shoes ' })).status).toBe(409);
      expect(await Category.countDocuments()).toBe(1);
    });

    it('the unique index is the safety net when two saves race (409 from the database)', async () => {
      // Simulate the race: both requests pass the "name free?" check at the same moment
      const auth = await adminAuth();
      const results = await Promise.all([
        create(auth, { name: 'Race' }),
        create(auth, { name: 'race' }),
      ]);
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 409]);
      expect(await Category.countDocuments()).toBe(1);
    });
  });

  describe('hierarchy (two levels)', () => {
    it('refuses a parent that is itself a sub-category (no third level)', async () => {
      const men = await createCategory({ name: 'Men' });
      const shoes = await createCategory({ name: 'Shoes', parent: men._id });
      const res = await create(await adminAuth(), { name: 'Sneakers', parent: String(shoes._id) });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Only two category levels are allowed');
    });

    it('refuses a parent that does not exist', async () => {
      const res = await create(await adminAuth(), { name: 'Shoes', parent: missingId() });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Parent category not found');
    });
  });

  it.each([
    ['a missing name', {}, 'name'],
    ['a non-text name', { name: 42 }, 'name'],
    ['a 1-character name', { name: 'A' }, 'name'],
    ['a 51-character name', { name: 'x'.repeat(51) }, 'name'],
    ['a too long description', { name: 'Shoes', description: 'x'.repeat(301) }, 'description'],
    ['a malformed parent id', { name: 'Shoes', parent: 'abc' }, 'parent'],
    ['an image that is not an object', { name: 'Shoes', image: 'pic.jpg' }, 'image'],
    [
      'an image from another website',
      { name: 'Shoes', image: { ...image, url: 'https://evil.example/x.jpg' } },
      'image.url',
    ],
    ['an image without url', { name: 'Shoes', image: { publicId: 'x' } }, 'image.url'],
    ['an image without publicId', { name: 'Shoes', image: { url: image.url } }, 'image.publicId'],
    ['a non-boolean isActive', { name: 'Shoes', isActive: 'maybe' }, 'isActive'],
    ['a negative sortOrder', { name: 'Shoes', sortOrder: -1 }, 'sortOrder'],
    ['a sortOrder over 1000', { name: 'Shoes', sortOrder: 1001 }, 'sortOrder'],
  ])('returns 400 for %s', async (_case, body, field) => {
    const res = await create(await adminAuth(), body);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
    expect(res.body.errors.map((e) => e.field)).toContain(field);
    expect(await Category.countDocuments()).toBe(0);
  });
});

describe('PUT /api/categories/:id (admin)', () => {
  it('renaming also renames the slug', async () => {
    const category = await createCategory({ name: 'Shoes' });
    const res = await update(await adminAuth(), category._id, { name: 'Footwear' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Category updated');
    expect(res.body.data).toMatchObject({ name: 'Footwear', slug: 'footwear' });
    expect((await getBySlug('shoes')).status).toBe(404); // the old URL is gone
  });

  it('changing only the case keeps the same slug (it does not clash with itself)', async () => {
    const category = await createCategory({ name: 'Shoes' });
    const res = await update(await adminAuth(), category._id, { name: 'SHOES' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ name: 'SHOES', slug: 'shoes' });
  });

  it('a rename onto a taken slug gets a numbered slug', async () => {
    await createCategory({ name: 'Bags' });
    const other = await createCategory({ name: 'Purses' });
    const res = await update(await adminAuth(), other._id, { name: 'Bags!' });
    expect(res.status).toBe(200);
    expect(res.body.data.slug).toBe('bags-2');
  });

  it('a partial update keeps the other fields (and the slug)', async () => {
    const category = await createCategory({ name: 'Shoes', description: 'Keep me', sortOrder: 3 });
    const res = await update(await adminAuth(), category._id, { isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      name: 'Shoes',
      slug: 'shoes',
      description: 'Keep me',
      sortOrder: 3,
      isActive: false,
    });
    // …and now customers cannot see it
    expect((await getBySlug('shoes')).status).toBe(404);
    expect((await list()).body.data).toHaveLength(0);
  });

  it('sets, replaces and removes (null) the image', async () => {
    const auth = await adminAuth();
    const category = await createCategory({ name: 'Shoes' });
    const set = await update(auth, category._id, { image });
    expect(set.body.data.image).toMatchObject(image);

    const removed = await update(auth, category._id, { image: null });
    expect(removed.status).toBe(200);
    expect(removed.body.data.image).toBeUndefined();
    expect((await Category.findById(category._id)).image).toBeUndefined();
  });

  it('moves a category under a parent, and back to top-level with parent: null', async () => {
    const auth = await adminAuth();
    const men = await createCategory({ name: 'Men' });
    const shoes = await createCategory({ name: 'Shoes' });

    const moved = await update(auth, shoes._id, { parent: String(men._id) });
    expect(moved.body.data.parent).toBe(String(men._id));

    const back = await update(auth, shoes._id, { parent: null });
    expect(back.status).toBe(200);
    expect(back.body.data.parent).toBeNull();
  });

  it('IGNORES a slug in the body', async () => {
    const category = await createCategory({ name: 'Shoes' });
    const res = await update(await adminAuth(), category._id, { slug: 'hacked' });
    expect(res.body.data.slug).toBe('shoes');
  });

  describe('hierarchy rules', () => {
    it('a category cannot be its own parent', async () => {
      const category = await createCategory({ name: 'Shoes' });
      const res = await update(await adminAuth(), category._id, { parent: String(category._id) });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('A category cannot be its own parent');
    });

    it('a category WITH sub-categories cannot become a sub-category', async () => {
      const men = await createCategory({ name: 'Men' });
      await createCategory({ name: 'Shoes', parent: men._id });
      const women = await createCategory({ name: 'Women' });
      const res = await update(await adminAuth(), men._id, { parent: String(women._id) });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe(
        'This category has sub-categories, so it cannot become a sub-category',
      );
      expect((await Category.findById(men._id)).parent).toBeNull();
    });

    it('the new parent must be top-level', async () => {
      const men = await createCategory({ name: 'Men' });
      const shoes = await createCategory({ name: 'Shoes', parent: men._id });
      const socks = await createCategory({ name: 'Socks' });
      const res = await update(await adminAuth(), socks._id, { parent: String(shoes._id) });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Only two category levels are allowed');
    });

    it('the new parent must exist', async () => {
      const category = await createCategory({ name: 'Shoes' });
      const res = await update(await adminAuth(), category._id, { parent: missingId() });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Parent category not found');
    });
  });

  it('returns 409 when renaming onto another category name (any case)', async () => {
    await createCategory({ name: 'Bags' });
    const other = await createCategory({ name: 'Purses' });
    const res = await update(await adminAuth(), other._id, { name: 'bags' });
    expect(res.status).toBe(409);
    expect((await Category.findById(other._id)).name).toBe('Purses');
  });

  it('returns 404 for an id that does not exist', async () => {
    const res = await update(await adminAuth(), missingId(), { name: 'Shoes' });
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Category not found');
  });

  it('returns 400 "Invalid id" for a malformed id', async () => {
    const res = await update(await adminAuth(), 'not-an-id', { name: 'Shoes' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ message: 'Invalid id', errors: [{ field: 'id' }] });
  });

  it('returns 400 for invalid fields (e.g. a 1-character name)', async () => {
    const category = await createCategory({ name: 'Shoes' });
    const res = await update(await adminAuth(), category._id, { name: 'X' });
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('name');
  });
});

describe('DELETE /api/categories/:id (admin)', () => {
  it('deletes a category', async () => {
    const category = await createCategory({ name: 'Shoes' });
    const res = await remove(await adminAuth(), category._id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ message: 'Category deleted', data: null });
    expect(await Category.findById(category._id)).toBeNull();
  });

  it('refuses to delete a category that has sub-categories (no orphans)', async () => {
    const auth = await adminAuth();
    const men = await createCategory({ name: 'Men' });
    await createCategory({ name: 'Shoes', parent: men._id });
    const one = await remove(auth, men._id);
    expect(one.status).toBe(400);
    expect(one.body.message).toBe('Cannot delete: it has 1 sub-category');

    await createCategory({ name: 'Shirts', parent: men._id });
    const two = await remove(auth, men._id);
    expect(two.body.message).toBe('Cannot delete: it has 2 sub-categories');
    expect(await Category.findById(men._id)).not.toBeNull();
  });

  it('a sub-category can be deleted, and then its parent too', async () => {
    const auth = await adminAuth();
    const men = await createCategory({ name: 'Men' });
    const shoes = await createCategory({ name: 'Shoes', parent: men._id });
    expect((await remove(auth, shoes._id)).status).toBe(200);
    expect((await remove(auth, men._id)).status).toBe(200);
  });

  it('frees the name and slug for reuse', async () => {
    const auth = await adminAuth();
    const category = await createCategory({ name: 'Shoes' });
    await remove(auth, category._id);
    const res = await create(auth, { name: 'Shoes' });
    expect(res.status).toBe(201);
    expect(res.body.data.slug).toBe('shoes');
  });

  it('returns 404 for a missing id and the second time', async () => {
    const auth = await adminAuth();
    const category = await createCategory({ name: 'Shoes' });
    await remove(auth, category._id);
    expect((await remove(auth, category._id)).status).toBe(404);
    expect((await remove(auth, missingId())).status).toBe(404);
  });

  it('returns 400 for a malformed id', async () => {
    expect((await remove(await adminAuth(), '123')).status).toBe(400);
  });
});
