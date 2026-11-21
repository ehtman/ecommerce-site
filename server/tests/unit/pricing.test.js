/**
 * UNIT tests for src/utils/pricing.js (pure functions: numbers in, numbers out).
 *
 * Money rules are tested at their EDGES: just below, exactly at and just above the
 * free-shipping threshold, because "off by one" mistakes hide exactly there.
 */
import { calcShipping, calcTotals } from '../../src/utils/pricing.js';
import { PRICING } from '../../src/config/constants.js';

describe('calcShipping (BR-02)', () => {
  it('charges nothing for an empty cart', () => {
    expect(calcShipping(0)).toBe(0);
    expect(calcShipping(-5)).toBe(0); // defensive: a negative amount never adds a fee
  });

  it('charges Rs 250 below Rs 5,000', () => {
    expect(calcShipping(1)).toBe(250);
    expect(calcShipping(4999)).toBe(PRICING.SHIPPING_FEE);
  });

  it('is free at exactly Rs 5,000 and above', () => {
    expect(calcShipping(5000)).toBe(0);
    expect(calcShipping(5001)).toBe(0);
    expect(calcShipping(250000)).toBe(0);
  });
});

describe('calcTotals', () => {
  it('adds shipping below the threshold and no tax (BR-03)', () => {
    expect(calcTotals(3000)).toEqual({
      itemsPrice: 3000,
      discountPrice: 0,
      shippingPrice: 250,
      taxPrice: 0,
      totalPrice: 3250,
    });
  });

  it('gives free shipping from Rs 5,000', () => {
    expect(calcTotals(5000).totalPrice).toBe(5000);
  });

  it('looks at the amount AFTER the discount for free shipping', () => {
    // 5,200 - 500 = 4,700 → below 5,000 → shipping is charged again
    const totals = calcTotals(5200, 500);
    expect(totals.shippingPrice).toBe(250);
    expect(totals.totalPrice).toBe(4950);
  });

  it('charges no shipping when there are no items', () => {
    expect(calcTotals(0).totalPrice).toBe(0);
    expect(calcTotals(0).shippingPrice).toBe(0);
  });

  it('keeps every amount a whole number of rupees', () => {
    const totals = calcTotals(1999 * 3, 100);
    Object.values(totals).forEach((v) => expect(Number.isInteger(v)).toBe(true));
  });
});
