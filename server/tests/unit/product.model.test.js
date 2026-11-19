/**
 * UNIT tests for the Product model's schema rules, virtuals and index definitions.
 * No database needed: `validateSync()` runs the schema validators in memory (it does NOT
 * run the async slug hook; tests/integration/product.model.db.test.js covers that).
 */
import mongoose from 'mongoose';
import { Product } from '../../src/modules/models.js';
import { LIMITS, REGEX, IMAGE_MIME_TYPES } from '../../src/config/constants.js';

const image = (n = 1) => ({
  url: `https://res.cloudinary.com/demo/image/upload/shopease/products/${n}.jpg`,
  publicId: `shopease/products/${n}`,
});

const valid = (overrides = {}) =>
  new Product({
    name: 'Blue Cotton Shirt',
    description: 'A soft, breathable cotton shirt for summer.',
    sku: 'shirt-blu-m',
    price: 1999,
    category: new mongoose.Types.ObjectId(),
    images: [image()],
    createdBy: new mongoose.Types.ObjectId(),
    ...overrides,
  });

const errorsOf = (doc) => doc.validateSync()?.errors ?? {};

describe('Product model – rules', () => {
  it('accepts a valid product and fills the defaults', () => {
    const p = valid();
    expect(p.validateSync()).toBeUndefined();
    expect(p.sku).toBe('SHIRT-BLU-M'); // stored upper-case
    expect(p).toMatchObject({
      stock: 0,
      sold: 0,
      ratingAverage: 0,
      ratingCount: 0,
      isFeatured: false,
      isActive: true,
    });
    expect(p.specifications).toEqual([]);
    expect(p.images[0]._id).toBeDefined(); // each image gets an id (to delete one image)
  });

  it('requires name, description, sku, price, category and createdBy', () => {
    const errors = errorsOf(new Product({ images: [image()] }));
    ['name', 'description', 'sku', 'price', 'category', 'createdBy'].forEach((f) =>
      expect(errors[f]).toBeDefined(),
    );
  });

  it('checks lengths', () => {
    const errors = errorsOf(valid({ name: 'ab', description: 'too short', brand: 'b'.repeat(51) }));
    expect(Object.keys(errors).sort()).toEqual(['brand', 'description', 'name']);
  });

  it('accepts only whole, positive, capped prices', () => {
    expect(errorsOf(valid({ price: 10.5 })).price.message).toBe('price must be a whole number');
    expect(errorsOf(valid({ price: 0 })).price).toBeDefined();
    expect(errorsOf(valid({ price: 10_000_001 })).price).toBeDefined();
  });

  it('compare-at price must be greater than price', () => {
    expect(errorsOf(valid({ compareAtPrice: 1999 })).compareAtPrice.message).toBe(
      'Compare-at price must be greater than price',
    );
    expect(errorsOf(valid({ compareAtPrice: 2500 })).compareAtPrice).toBeUndefined();
    expect(errorsOf(valid({ compareAtPrice: 2500.5 })).compareAtPrice).toBeDefined();
  });

  it('rejects a bad SKU', () => {
    expect(errorsOf(valid({ sku: 'a b' })).sku).toBeDefined();
    expect(errorsOf(valid({ sku: 'AB' })).sku).toBeDefined();
    expect(errorsOf(valid({ sku: 'A'.repeat(31) })).sku).toBeDefined();
  });

  it(`needs 1 to ${LIMITS.MAX_PRODUCT_IMAGES} images, all on Cloudinary`, () => {
    expect(errorsOf(valid({ images: [] })).images.message).toMatch(/needs 1–5 images/);
    const six = [1, 2, 3, 4, 5, 6].map(image);
    expect(errorsOf(valid({ images: six })).images).toBeDefined();
    const foreign = errorsOf(
      valid({ images: [{ url: 'https://evil.example/x.jpg', publicId: 'x' }] }),
    );
    expect(foreign['images.0.url'].message).toBe('Image must be a Cloudinary URL');
  });

  it(`allows at most ${LIMITS.MAX_SPECIFICATIONS} specifications`, () => {
    const specs = (n) => Array.from({ length: n }, (_, i) => ({ key: `k${i}`, value: 'v' }));
    expect(errorsOf(valid({ specifications: specs(20) })).specifications).toBeUndefined();
    expect(errorsOf(valid({ specifications: specs(21) })).specifications).toBeDefined();
  });

  it('stock and sold are whole numbers ≥ 0', () => {
    expect(errorsOf(valid({ stock: -1 })).stock.message).toBe('Stock cannot be negative');
    expect(errorsOf(valid({ stock: 1.5 })).stock).toBeDefined();
    expect(errorsOf(valid({ sold: -1 })).sold).toBeDefined();
  });

  it('rounds ratingAverage to one decimal', () => {
    expect(valid({ ratingAverage: 4.46666 }).ratingAverage).toBe(4.5);
  });
});

describe('Product model – virtuals', () => {
  it('inStock is true only when stock > 0', () => {
    expect(valid({ stock: 0 }).inStock).toBe(false);
    expect(valid({ stock: 3 }).inStock).toBe(true);
  });

  it('discountPercent from compareAtPrice, 0 without one', () => {
    expect(valid({ price: 1500, compareAtPrice: 2000 }).discountPercent).toBe(25);
    expect(valid().discountPercent).toBe(0);
    // A wrong (lower) compare-at price never shows a negative discount
    const odd = valid({ price: 1500 });
    odd.compareAtPrice = 1000;
    expect(odd.discountPercent).toBe(0);
  });

  it('virtuals appear in JSON; __v and id do not', () => {
    const json = valid({ stock: 2 }).toJSON();
    expect(json.inStock).toBe(true);
    expect(json.discountPercent).toBe(0);
    expect(json.__v).toBeUndefined();
    expect(json.id).toBeUndefined();
  });
});

describe('Product model – indexes and hidden fields', () => {
  const indexes = Product.schema.indexes();

  it('has the text index with name weighted highest', () => {
    const text = indexes.find(([, opts]) => opts.name === 'product_text_search');
    expect(text[0]).toEqual({ name: 'text', brand: 'text', description: 'text' });
    expect(text[1].weights).toEqual({ name: 10, brand: 5, description: 1 });
  });

  it('has a compound index for each public sort', () => {
    const keys = indexes.map(([fields]) => JSON.stringify(fields));
    for (const fields of [
      { isActive: 1, createdAt: -1 },
      { isActive: 1, price: 1 },
      { isActive: 1, ratingAverage: -1 },
      { isActive: 1, sold: -1 },
      { category: 1, isActive: 1, price: 1 },
    ]) {
      expect(keys).toContain(JSON.stringify(fields));
    }
  });

  it('slug and sku are unique', () => {
    expect(Product.schema.path('slug').options.unique).toBe(true);
    expect(Product.schema.path('sku').options.unique).toBe(true);
  });

  it('stockHistory is hidden from normal queries (select: false)', () => {
    expect(Product.schema.path('stockHistory').options.select).toBe(false);
  });
});

describe('Branch 04 constants', () => {
  it('has the product limits and upload rules', () => {
    expect(LIMITS).toMatchObject({
      MAX_ADDRESSES: 5, // unchanged from branch 02
      MAX_PRODUCT_IMAGES: 5,
      MAX_SPECIFICATIONS: 20,
      STOCK_HISTORY_KEEP: 50,
      LOW_STOCK_THRESHOLD: 5,
      MAX_IMAGE_BYTES: 2 * 1024 * 1024,
    });
    expect(IMAGE_MIME_TYPES).toEqual(['image/jpeg', 'image/png', 'image/webp']);
    expect(REGEX.SKU.test('TSHIRT-BLK-M')).toBe(true);
    expect(REGEX.SKU.test('tshirt')).toBe(false); // the regex itself expects upper-case
  });
});
