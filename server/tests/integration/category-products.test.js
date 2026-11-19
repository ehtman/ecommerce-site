/**
 * INTEGRATION tests for what branch 04 adds to the CATEGORIES module:
 *  - a category used by products cannot be deleted (400; deactivate it instead)
 *  - replaced/removed category images are deleted from Cloudinary (stubbed here)
 *  - listAllWithCounts(): every category with its product count (for the admin, branch 10)
 */
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import { api, createAdmin, bearer, createCategory, createProduct } from '../helpers/factories.js';
import { Category } from '../../src/modules/models.js';
import { cloudinaryClient } from '../../src/config/cloudinary.js';
import { listAllWithCounts } from '../../src/modules/categories/category.service.js';

const realCloudinary = { ...cloudinaryClient };
let destroyed;
let adminAuth;

const catImage = (name) => ({
  url: `https://res.cloudinary.com/demo/image/upload/shopease/categories/${name}.jpg`,
  publicId: `shopease/categories/${name}`,
});

beforeAll(connectTestDB);
beforeEach(async () => {
  destroyed = [];
  cloudinaryClient.isConfigured = () => true;
  cloudinaryClient.destroy = async (publicId) => {
    destroyed.push(publicId);
  };
  adminAuth = bearer(await createAdmin());
});
afterEach(async () => {
  Object.assign(cloudinaryClient, realCloudinary);
  await clearTestDB();
});
afterAll(closeTestDB);

const remove = (id) => api().delete(`/api/categories/${id}`).set('Authorization', adminAuth);

describe('DELETE /api/categories/:id with products', () => {
  it('400 while products use the category (active or not), nothing deleted', async () => {
    const category = await createCategory();
    await createProduct({ category: category._id });
    await createProduct({ category: category._id, isActive: false });
    const res = await remove(category._id);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(
      'Cannot delete: 2 product(s) use this category. Deactivate it instead.',
    );
    expect(await Category.exists({ _id: category._id })).not.toBeNull();
  });

  it('deletes an unused category and its image from Cloudinary', async () => {
    const category = await createCategory({ image: catImage('old') });
    const res = await remove(category._id);
    expect(res.status).toBe(200);
    expect(destroyed).toEqual(['shopease/categories/old']);
  });

  it('deletes an unused category without an image (nothing to clean up)', async () => {
    const category = await createCategory();
    expect((await remove(category._id)).status).toBe(200);
    expect(destroyed).toEqual([]);
  });
});

describe('PUT /api/categories/:id image clean-up', () => {
  const update = (id, body) =>
    api().put(`/api/categories/${id}`).set('Authorization', adminAuth).send(body);

  it('a replaced image is deleted from Cloudinary', async () => {
    const category = await createCategory({ image: catImage('old') });
    const res = await update(category._id, { name: category.name, image: catImage('new') });
    expect(res.status).toBe(200);
    expect(destroyed).toEqual(['shopease/categories/old']);
  });

  it('a removed image (image: null) is deleted too', async () => {
    const category = await createCategory({ image: catImage('old') });
    const res = await update(category._id, { name: category.name, image: null });
    expect(res.status).toBe(200);
    expect(destroyed).toEqual(['shopease/categories/old']);
  });

  it('an unchanged image is kept', async () => {
    const category = await createCategory({ image: catImage('same') });
    await update(category._id, { name: 'Renamed', image: catImage('same') });
    expect(destroyed).toEqual([]);
  });
});

describe('listAllWithCounts (admin, branch 10)', () => {
  it('every category (inactive too) with its product count', async () => {
    const men = await createCategory({ name: 'Men', sortOrder: 1 });
    const kids = await createCategory({ name: 'Kids', sortOrder: 2, isActive: false });
    const shoes = await createCategory({ name: 'Shoes', parent: men._id, sortOrder: 3 });
    await createProduct({ category: men._id });
    await createProduct({ category: men._id });
    await createProduct({ category: shoes._id });

    const list = await listAllWithCounts();
    expect(list.map((c) => [c.name, c.productCount])).toEqual([
      ['Men', 2],
      ['Kids', 0],
      ['Shoes', 1],
    ]);
    expect(list[2].parent).toMatchObject({ name: 'Men', slug: 'men' });
    expect(String(list[1]._id)).toBe(String(kids._id));
  });
});
