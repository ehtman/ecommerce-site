/**
 * UNIT tests for the Category model's schema rules, its indexes and the shared image
 * sub-schema. `validateSync()` checks the field rules in memory (no database). It does NOT
 * run the async slug hook; the integration tests cover slugs with a real database.
 */
import mongoose from 'mongoose';
import { Category } from '../../src/modules/models.js';
import { REGEX } from '../../src/config/constants.js';

const cloudinaryImage = {
  url: 'https://res.cloudinary.com/demo/image/upload/v1/shopease/categories/shoes.jpg',
  publicId: 'shopease/categories/shoes',
};

describe('Category model', () => {
  it('accepts a minimal category and fills the defaults', () => {
    const category = new Category({ name: 'Shoes' });
    expect(category.validateSync()).toBeUndefined();
    expect(category).toMatchObject({ description: '', parent: null, isActive: true, sortOrder: 0 });
    expect(category.image).toBeUndefined(); // absent, not an empty object
  });

  it('requires a name of 2–50 characters', () => {
    expect(new Category({}).validateSync().errors.name).toBeDefined();
    expect(new Category({ name: 'A' }).validateSync().errors.name).toBeDefined();
    expect(new Category({ name: 'x'.repeat(51) }).validateSync().errors.name).toBeDefined();
  });

  it('limits description, sortOrder and checks the slug format', () => {
    const { errors } = new Category({
      name: 'Shoes',
      description: 'x'.repeat(301),
      sortOrder: 1001,
      slug: 'Not A Slug!',
    }).validateSync();
    expect(Object.keys(errors).sort()).toEqual(['description', 'slug', 'sortOrder']);
    expect(
      new Category({ name: 'Shoes', sortOrder: -1 }).validateSync().errors.sortOrder,
    ).toBeDefined();
  });

  it('the slug hook skips a missing name, so the real error is "name is required"', async () => {
    // validate() runs the async hook too; with no name it returns before touching the DB
    const category = new Category({});
    await expect(category.validate()).rejects.toMatchObject({
      errors: { name: expect.objectContaining({ message: 'Category name is required' }) },
    });
    expect(category.slug).toBeUndefined(); // never "undefined" as a slug
  });

  it('trims the name', () => {
    expect(new Category({ name: '  Shoes  ' }).name).toBe('Shoes');
  });

  it('declares a case-insensitive unique name index, a unique slug index and a parent index', () => {
    const indexes = Category.schema.indexes();
    expect(indexes).toEqual(
      expect.arrayContaining([
        [
          { name: 1 },
          expect.objectContaining({ unique: true, collation: { locale: 'en', strength: 2 } }),
        ],
        [{ slug: 1 }, expect.objectContaining({ unique: true })],
        [{ parent: 1, sortOrder: 1 }, expect.anything()],
      ]),
    );
  });

  it('has a `children` virtual pointing at categories whose parent is me', () => {
    const virtual = Category.schema.virtuals.children;
    expect(virtual.options).toMatchObject({
      ref: 'Category',
      localField: '_id',
      foreignField: 'parent',
    });
  });

  it('hides __v and id in JSON', () => {
    const json = new Category({ name: 'Shoes', parent: new mongoose.Types.ObjectId() }).toJSON();
    expect(json.__v).toBeUndefined();
    expect(json.id).toBeUndefined();
    expect(json._id).toBeDefined();
  });
});

describe('image sub-schema (db/schemas/image.schema.js)', () => {
  it('accepts a Cloudinary https URL with a publicId and gives the image its own _id', () => {
    const category = new Category({ name: 'Shoes', image: cloudinaryImage });
    expect(category.validateSync()).toBeUndefined();
    expect(category.image._id).toBeDefined();
  });

  it.each([
    ['another website', 'https://evil.example/shoes.jpg'],
    ['plain http', 'http://res.cloudinary.com/demo/image/upload/shoes.jpg'],
    ['a look-alike host', 'https://res.cloudinary.com.evil.example/x.jpg'],
  ])('refuses %s', (_case, url) => {
    const { errors } = new Category({
      name: 'Shoes',
      image: { ...cloudinaryImage, url },
    }).validateSync();
    expect(errors['image.url'].message).toBe('Image must be a Cloudinary URL');
  });

  it('requires both url and publicId', () => {
    const { errors } = new Category({ name: 'Shoes', image: {} }).validateSync();
    expect(errors['image.url']).toBeDefined();
    expect(errors['image.publicId']).toBeDefined();
  });

  it('REGEX.SLUG accepts "a-b-1" style slugs only', () => {
    ['shoes', 'mens-shoes', 't-shirts-2025'].forEach((s) => expect(s).toMatch(REGEX.SLUG));
    ['Shoes', '-shoes', 'shoes-', 'mens--shoes', 'mens shoes', ''].forEach((s) =>
      expect(s).not.toMatch(REGEX.SLUG),
    );
  });
});
