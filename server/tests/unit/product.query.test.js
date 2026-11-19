/**
 * UNIT tests for src/modules/products/product.query.js (pure functions, no database).
 * The query builder is a security boundary (a WHITELIST), so we test both what it builds
 * AND what it refuses to build.
 */
import {
  buildProductFilter,
  getSort,
  SORTS,
  escapeRegex,
} from '../../src/modules/products/product.query.js';

describe('buildProductFilter', () => {
  it('with no query: only active products', () => {
    expect(buildProductFilter({})).toEqual({ isActive: true });
  });

  it('can never be tricked into showing inactive products', () => {
    expect(buildProductFilter({ isActive: 'false' })).toEqual({ isActive: true });
    expect(buildProductFilter({ isActive: { $ne: true } })).toEqual({ isActive: true });
  });

  it('ignores parameters it does not know', () => {
    expect(buildProductFilter({ sku: 'X', stockHistory: '1', $where: '1' })).toEqual({
      isActive: true,
    });
  });

  it('keyword → $text search, trimmed and cut to 100 characters', () => {
    expect(buildProductFilter({ keyword: '  cotton shirt ' }).$text).toEqual({
      $search: 'cotton shirt',
    });
    expect(buildProductFilter({ keyword: 'a'.repeat(300) }).$text.$search).toHaveLength(100);
  });

  it.each([[''], ['   '], [['a', 'b']], [{ $gt: '' }]])('ignores a keyword like %p', (keyword) => {
    expect(buildProductFilter({ keyword }).$text).toBeUndefined();
  });

  it('category ids → $in', () => {
    expect(buildProductFilter({}, ['a', 'b']).category).toEqual({ $in: ['a', 'b'] });
    expect(buildProductFilter({}, []).category).toEqual({ $in: [] }); // unknown slug → nothing
    expect(buildProductFilter({}, null).category).toBeUndefined();
  });

  it('price range with either or both ends', () => {
    expect(buildProductFilter({ minPrice: '500' }).price).toEqual({ $gte: 500 });
    expect(buildProductFilter({ maxPrice: '3000' }).price).toEqual({ $lte: 3000 });
    expect(buildProductFilter({ minPrice: '0', maxPrice: '10' }).price).toEqual({
      $gte: 0,
      $lte: 10,
    });
  });

  it.each([['abc'], ['-5'], [''], [['1']], ['Infinity']])('ignores a price like %p', (bad) => {
    expect(buildProductFilter({ minPrice: bad, maxPrice: bad }).price).toBeUndefined();
  });

  it('rating → ratingAverage >= rating (capped at 5; 0 = any)', () => {
    expect(buildProductFilter({ rating: '4' }).ratingAverage).toEqual({ $gte: 4 });
    expect(buildProductFilter({ rating: '9' }).ratingAverage).toEqual({ $gte: 5 });
    expect(buildProductFilter({ rating: '0' }).ratingAverage).toBeUndefined();
  });

  it('inStock and isFeatured only switch on with the exact text "true"', () => {
    expect(buildProductFilter({ inStock: 'true' }).stock).toEqual({ $gt: 0 });
    expect(buildProductFilter({ isFeatured: 'true' }).isFeatured).toBe(true);
    expect(buildProductFilter({ inStock: '1', isFeatured: 'yes' })).toEqual({ isActive: true });
  });

  it('brand → exact, case-insensitive, with special characters escaped', () => {
    const { brand } = buildProductFilter({ brand: ' Khaadi ' });
    expect(brand.test('khaadi')).toBe(true);
    expect(brand.test('KHAADI')).toBe(true);
    expect(brand.test('Khaadi Kids')).toBe(false); // exact, not "contains"
    const dotted = buildProductFilter({ brand: 'a.b' }).brand;
    expect(dotted.test('a.b')).toBe(true);
    expect(dotted.test('axb')).toBe(false); // "." is literal, not "any character"
  });

  it('combines several filters', () => {
    expect(buildProductFilter({ minPrice: '1', inStock: 'true', isFeatured: 'true' })).toEqual({
      isActive: true,
      price: { $gte: 1 },
      stock: { $gt: 0 },
      isFeatured: true,
    });
  });
});

describe('getSort', () => {
  it.each(Object.keys(SORTS))('knows %s', (name) => {
    expect(getSort(name)).toBe(SORTS[name]);
  });

  it('falls back to newest for unknown, missing or tricky values', () => {
    for (const bad of [undefined, '', 'price', 'toString', '__proto__', 'constructor']) {
      expect(getSort(bad)).toBe(SORTS.newest);
    }
  });

  it('every sort ends with _id as a tie-breaker (stable pages)', () => {
    for (const sort of Object.values(SORTS)) {
      expect(Object.keys(sort).at(-1)).toBe('_id');
    }
  });
});

describe('escapeRegex', () => {
  it('escapes every special character', () => {
    expect(escapeRegex('a.b*c+(d)?[e]{f}|^$\\')).toBe(
      'a\\.b\\*c\\+\\(d\\)\\?\\[e\\]\\{f\\}\\|\\^\\$\\\\',
    );
  });
});
