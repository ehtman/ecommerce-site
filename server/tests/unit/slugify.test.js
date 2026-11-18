/**
 * UNIT tests for src/db/utils/slugify.js.
 *
 * slugify() is a pure function (text in, text out), so it needs no database.
 * uniqueSlug() asks a model "does this slug exist?". Here a tiny FAKE model answers from
 * an in-memory list, so we can test the numbering logic without MongoDB.
 */
import slugify, { uniqueSlug } from '../../src/db/utils/slugify.js';
import { REGEX } from '../../src/config/constants.js';

// A fake Mongoose model: exists() looks in `docs` and honours the { _id: { $ne } } filter
const fakeModel = (docs) => ({
  calls: [],
  async exists(filter) {
    this.calls.push(filter);
    return docs.some((d) => d.slug === filter.slug && (!filter._id || d._id !== filter._id.$ne));
  },
});

describe('slugify', () => {
  it.each([
    ['Electronics', 'electronics'],
    ['Men’s Shoes', 'mens-shoes'],
    ["Men's Shoes", 'mens-shoes'],
    ['  Home   &   Kitchen  ', 'home-kitchen'],
    ['Café Crème', 'cafe-creme'],
    ['snake_case_name', 'snake-case-name'],
    ['--Already-Dashed--', 'already-dashed'],
    ['T-Shirts 2025', 't-shirts-2025'],
    ['UPPER lower', 'upper-lower'],
    [123, '123'],
  ])('%p → %p', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it('returns "" when nothing URL-friendly is left (symbols or non-Latin letters)', () => {
    expect(slugify('!!!')).toBe('');
    expect(slugify('کپڑے')).toBe(''); // Urdu for "clothes"
  });

  it('always produces something that matches REGEX.SLUG (or nothing at all)', () => {
    ['Bags & Wallets', ' x ', 'A--B__C  D', 'Ünïcödé Tëxt', '9 to 5'].forEach((name) => {
      expect(slugify(name)).toMatch(REGEX.SLUG);
    });
  });
});

describe('uniqueSlug', () => {
  it('uses the plain slug when it is free', async () => {
    expect(await uniqueSlug(fakeModel([]), 'Blue Mug')).toBe('blue-mug');
  });

  it('adds -2, -3 … until it finds a free slug', async () => {
    const model = fakeModel([{ slug: 'blue-mug' }, { slug: 'blue-mug-2' }]);
    expect(await uniqueSlug(model, 'Blue Mug')).toBe('blue-mug-3');
    expect(model.calls).toHaveLength(3); // blue-mug, blue-mug-2, blue-mug-3
  });

  it("ignores the document's OWN slug when an id is given (renaming keeps the slug)", async () => {
    const model = fakeModel([{ _id: 'me', slug: 'blue-mug' }]);
    expect(await uniqueSlug(model, 'Blue Mug', 'me')).toBe('blue-mug');
    expect(model.calls[0]).toEqual({ slug: 'blue-mug', _id: { $ne: 'me' } });
  });

  it('falls back to "item" when the name has no URL-friendly characters', async () => {
    expect(await uniqueSlug(fakeModel([]), '!!!')).toBe('item');
    expect(await uniqueSlug(fakeModel([{ slug: 'item' }]), '???')).toBe('item-2');
  });
});
