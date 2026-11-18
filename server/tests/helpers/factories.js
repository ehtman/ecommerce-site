/**
 * tests/helpers/factories.js – small helpers that create test data and log users in.
 *
 * "Factories" keep tests short and readable: a test says WHAT it needs
 * ("a verified customer") instead of repeating HOW to build one each time.
 */
import request from 'supertest';
import app from '../../src/app.js';
import { User, Address, Category } from '../../src/modules/models.js';
import generateToken from '../../src/utils/generateToken.js';
import { outbox } from '../../src/emails/sendEmail.js';

export const PASSWORD = 'secret123'; // a valid password used across tests

let counter = 0;
// A unique email per call, so tests never collide on the unique index
export const uniqueEmail = (prefix = 'user') => `${prefix}${Date.now()}${(counter += 1)}@test.com`;

/** Creates a user directly in the database (fast, skips the HTTP layer). */
export async function createUser(overrides = {}) {
  return new User({
    name: 'Test User',
    email: uniqueEmail(),
    password: PASSWORD,
    isEmailVerified: true,
    ...overrides, // let each test change any field
  }).save();
}

/** Creates an admin. */
export const createAdmin = (overrides = {}) =>
  createUser({ name: 'Admin', role: 'admin', ...overrides });

/** Returns a ready-to-use "Bearer <jwt>" header value for a user. */
export const bearer = (user) => `Bearer ${generateToken(user)}`;

/** Creates a user and returns { user, auth } where auth is the Authorization header. */
export async function loggedIn(overrides = {}) {
  const user = await createUser(overrides);
  return { user, auth: bearer(user) };
}

/**
 * A complete, valid address body (what the frontend's address form sends).
 * Spread it and override what a test cares about: { ...validAddress(), city: 'Karachi' }.
 */
export const validAddress = (overrides = {}) => ({
  label: 'Home',
  fullName: 'Ali Khan',
  phone: '03001234567',
  addressLine1: 'House 12, Street 4, Gulberg III',
  city: 'Lahore',
  province: 'Punjab',
  postalCode: '54000',
  ...overrides,
});

/**
 * Saves an address for `user` directly in the database (skips the HTTP layer and its
 * rules, so tests can set up any state, e.g. "already 5 addresses").
 */
export const createAddress = (user, overrides = {}) =>
  Address.create({ ...validAddress(), user: user._id, ...overrides });

let categoryCounter = 0;
/**
 * Saves a category directly in the database (the slug hook still runs).
 * Each call gets a unique name, so tests never collide on the unique name index.
 * Override anything: createCategory({ name: 'Shoes', parent: men._id, isActive: false }).
 */
export const createCategory = (overrides = {}) =>
  Category.create({ name: `Category ${Date.now()}-${(categoryCounter += 1)}`, ...overrides });

/** The supertest client for our app (no real network port needed). */
export const api = () => request(app);

/**
 * Reads the token from the most recent email sent to `email`.
 * Emails contain links like http://localhost:5173/verify-email?token=abc…
 */
export function tokenFromLastEmail(email) {
  const mail = [...outbox].reverse().find((m) => m.to === email);
  if (!mail) throw new Error(`No email sent to ${email}`);
  const match = mail.text.match(/token=([a-f0-9]+)/);
  return match ? match[1] : null;
}
