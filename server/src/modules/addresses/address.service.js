/**
 * src/modules/addresses/address.service.js – business logic for a customer's addresses.
 *
 * Layers: routes → controller → SERVICE → model. No req/res here; errors are ApiErrors.
 * Used by: address.controller.js (and, in branch 07, the order service at checkout).
 *
 * Two ideas meet here for the first time:
 *
 * 1) OWNERSHIP (resource-level authorization). `authorize('customer')` only says "customers
 *    may use these routes". It does NOT say WHICH addresses a customer may touch. So every
 *    query below includes `user: userId` (the id from the verified token). Asking for
 *    someone else's address id simply finds nothing → 404. Forgetting this filter is a
 *    classic security bug called IDOR (Insecure Direct Object Reference).
 *    See docs/concepts/14-authorization-ownership.md.
 *
 * 2) TRANSACTIONS. Changing the default address is TWO writes ("unset the old default",
 *    "set the new one"). A transaction makes them all-or-nothing, so a customer is never
 *    left with zero (or two) default addresses if something fails half-way.
 */
import mongoose from 'mongoose';
import { Address } from '../models.js';
import ApiError from '../../utils/ApiError.js';
import { LIMITS } from '../../config/constants.js';

// The ONLY fields a client may set. `user`, `country`, `isDefault`, `_id`… are never
// copied from the body (mass assignment protection). `isDefault` has its own logic below.
const FIELDS = [
  'label',
  'fullName',
  'phone',
  'addressLine1',
  'addressLine2',
  'city',
  'province',
  'postalCode',
];
// Copies the allowed fields that were actually sent: pick({ city: 'X', role: 'admin' }) → { city: 'X' }
const pick = (body) =>
  Object.fromEntries(FIELDS.filter((f) => body[f] !== undefined).map((f) => [f, body[f]]));

// Newest first. `_id` breaks ties: two addresses saved in the same millisecond have the same
// createdAt, but ObjectIds created later are always larger, so the order stays stable.
const NEWEST_FIRST = { createdAt: -1, _id: -1 };

// One message for "does not exist" AND "belongs to someone else" (see listAddresses note)
const notFound = () => new ApiError(404, 'Address not found');

/**
 * Makes ONE address the default and un-defaults all others, inside a transaction.
 * Order matters: unset first, then set. The other way round, MongoDB's unique partial index
 * would (correctly) refuse a moment with two defaults.
 */
async function makeDefault(userId, addressId) {
  // connection.transaction() starts a session, runs our function, commits if it finishes
  // and ABORTS (undoes every write) if it throws. It also retries on temporary conflicts.
  await mongoose.connection.transaction(async (session) => {
    await Address.updateMany(
      { user: userId, isDefault: true },
      { isDefault: false },
      { session }, // `session` = "this write is part of the transaction"
    );
    const result = await Address.updateOne(
      { _id: addressId, user: userId }, // ownership check INSIDE the transaction
      { isDefault: true },
      { session },
    );
    // Not found (or not yours) → throw → the "unset" above is rolled back too
    if (result.matchedCount === 0) throw notFound();
  });
}

/** All my addresses: the default first, then newest first. */
export function listAddresses(userId) {
  // Filtering by the owner IS the authorization: other customers' addresses are invisible
  return Address.find({ user: userId }).sort({ isDefault: -1, ...NEWEST_FIRST });
}

/** Save a new address (max 5). The first address automatically becomes the default. */
export async function createAddress(userId, body) {
  const count = await Address.countDocuments({ user: userId });
  if (count >= LIMITS.MAX_ADDRESSES) {
    throw new ApiError(400, `You can save at most ${LIMITS.MAX_ADDRESSES} addresses`);
  }
  // `user` comes from the token, never from the body. A first address must be the default.
  const address = await Address.create({ ...pick(body), user: userId, isDefault: count === 0 });
  // The customer asked "make this my default" → move the default flag to it
  if (body.isDefault && !address.isDefault) await makeDefault(userId, address._id);
  return Address.findById(address._id); // re-read so the response shows the final isDefault
}

/** Replace the fields of one of MY addresses. */
export async function updateAddress(userId, id, body) {
  // `_id` AND `user` in the same filter: a foreign id finds nothing → 404, never 403.
  // (A 403 would confirm "this address exists, it's just not yours", which leaks information.)
  const address = await Address.findOne({ _id: id, user: userId });
  if (!address) throw notFound();
  Object.assign(address, pick(body)); // only the allowed fields
  await address.save(); // runs the model's validators again
  // isDefault: true moves the default here. isDefault: false is ignored on purpose:
  // "un-defaulting" would leave the customer with no default. Pick another one instead.
  if (body.isDefault && !address.isDefault) await makeDefault(userId, address._id);
  return Address.findById(address._id);
}

/** Delete one of MY addresses. If it was the default, the newest remaining one takes over. */
export async function deleteAddress(userId, id) {
  const address = await Address.findOneAndDelete({ _id: id, user: userId });
  if (!address) throw notFound();
  if (address.isDefault) {
    const newest = await Address.findOne({ user: userId }).sort(NEWEST_FIRST);
    // `newest` is null when that was the last address: zero addresses → no default needed
    if (newest) await makeDefault(userId, newest._id);
  }
}

/** Make one of MY addresses the default. Returns the updated list (the UI redraws it). */
export async function setDefault(userId, id) {
  await makeDefault(userId, id);
  return listAddresses(userId);
}
