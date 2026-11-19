/**
 * UNIT tests for src/utils/pagination.js (pure functions, no database).
 * They prove that ANY ?page / ?limit value, however strange, becomes a safe number.
 */
import { getPagination, buildMeta } from '../../src/utils/pagination.js';

describe('getPagination', () => {
  it('uses the defaults when nothing is sent', () => {
    expect(getPagination({})).toEqual({ page: 1, limit: 12, skip: 0 });
  });

  it('turns query-string text into numbers and computes skip', () => {
    expect(getPagination({ page: '3', limit: '10' })).toEqual({ page: 3, limit: 10, skip: 20 });
  });

  it('respects a custom default and maximum', () => {
    expect(getPagination({}, 20, 100)).toEqual({ page: 1, limit: 20, skip: 0 });
    expect(getPagination({ limit: '500' }, 20, 100).limit).toBe(100);
  });

  it.each([
    ['0', 1],
    ['-4', 1],
    ['abc', 1],
    [undefined, 1],
    ['2.9', 2], // parseInt cuts decimals off
  ])('page %p becomes %p', (page, expected) => {
    expect(getPagination({ page }).page).toBe(expected);
  });

  it.each([
    ['0', 12], // 0 is "nothing sent" → default
    ['-3', 1], // negative → at least 1
    ['abc', 12],
    ['1000', 48], // capped at the maximum
    ['5', 5],
  ])('limit %p becomes %p', (limit, expected) => {
    expect(getPagination({ limit }).limit).toBe(expected);
  });
});

describe('buildMeta', () => {
  it('counts pages by rounding up', () => {
    expect(buildMeta(2, 12, 30)).toEqual({ page: 2, limit: 12, total: 30, pages: 3 });
    expect(buildMeta(1, 10, 10).pages).toBe(1);
  });

  it('says 1 page (not 0) for an empty list', () => {
    expect(buildMeta(1, 12, 0)).toEqual({ page: 1, limit: 12, total: 0, pages: 1 });
  });
});
