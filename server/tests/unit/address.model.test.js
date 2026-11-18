/**
 * UNIT tests for the Address model's schema rules and the new `phone` field on User.
 * No database needed: `validateSync()` runs the schema validators in memory.
 * (Why repeat rules the validation layer already checks? Defence in depth: code that
 * skips the HTTP layer, such as a script, still cannot save a broken address.)
 */
import mongoose from 'mongoose';
import { Address, User } from '../../src/modules/models.js';
import { PROVINCES, ADDRESS_LABELS, LIMITS, REGEX } from '../../src/config/constants.js';

const valid = (overrides = {}) =>
  new Address({
    user: new mongoose.Types.ObjectId(),
    fullName: 'Ali Khan',
    phone: '03001234567',
    addressLine1: 'House 12, Street 4',
    city: 'Lahore',
    province: 'Punjab',
    postalCode: '54000',
    ...overrides,
  });

describe('Address model', () => {
  it('accepts a valid address and fills the defaults', () => {
    const address = valid();
    expect(address.validateSync()).toBeUndefined();
    expect(address.label).toBe('Home');
    expect(address.country).toBe('Pakistan');
    expect(address.isDefault).toBe(false);
  });

  it('requires the owner and every delivery field', () => {
    const { errors } = new Address({}).validateSync();
    ['user', 'fullName', 'phone', 'addressLine1', 'city', 'province', 'postalCode'].forEach(
      (field) => expect(errors[field]).toBeDefined(),
    );
  });

  it('rejects a bad phone, postal code, province, label and country', () => {
    const { errors } = valid({
      phone: '12345',
      postalCode: '5400',
      province: 'Texas',
      label: 'Boat',
      country: 'India',
    }).validateSync();
    expect(errors.phone.message).toBe('Phone must be 03XXXXXXXXX');
    expect(errors.postalCode.message).toBe('Postal code must be 5 digits');
    expect(errors.province.message).toBe('Invalid province');
    expect(errors.label.message).toBe('Invalid label');
    expect(errors.country).toBeDefined();
  });

  it('has the unique partial index that allows only one default per user', () => {
    const index = Address.schema
      .indexes()
      .find(([, options]) => options.name === 'one_default_address_per_user');
    expect(index[0]).toEqual({ user: 1 });
    expect(index[1]).toMatchObject({ unique: true, partialFilterExpression: { isDefault: true } });
  });
});

describe('User.phone', () => {
  const user = (phone) => new User({ name: 'Ali', email: 'a@b.co', password: 'x', phone });

  it('is optional', () => {
    expect(user(undefined).validateSync()).toBeUndefined();
  });

  it('must look like 03XXXXXXXXX when present', () => {
    expect(user('03001234567').validateSync()).toBeUndefined();
    expect(user('+923001234567').validateSync().errors.phone.message).toBe(
      'Phone must be 03XXXXXXXXX',
    );
  });
});

describe('Address constants', () => {
  it('are frozen so no code can change them by accident', () => {
    expect(Object.isFrozen(PROVINCES)).toBe(true);
    expect(Object.isFrozen(ADDRESS_LABELS)).toBe(true);
    expect(Object.isFrozen(LIMITS)).toBe(true);
    expect(LIMITS.MAX_ADDRESSES).toBe(5);
  });

  it.each([
    ['03001234567', true],
    ['0300123456', false], // 10 digits
    ['030012345678', false], // 12 digits
    ['13001234567', false], // wrong prefix
  ])('PK_PHONE %s → %s', (phone, ok) => {
    expect(REGEX.PK_PHONE.test(phone)).toBe(ok);
  });

  it.each([
    ['54000', true],
    ['5400', false],
    ['540000', false],
    ['54a00', false],
  ])('POSTAL_CODE %s → %s', (code, ok) => {
    expect(REGEX.POSTAL_CODE.test(code)).toBe(ok);
  });
});
