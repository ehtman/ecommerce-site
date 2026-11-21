/**
 * src/modules/addresses/address.model.js – the Address collection: a customer's saved
 * delivery addresses.
 *
 * WHAT: One document per address. Each address belongs to exactly ONE user (`user` field).
 * WHY:  Customers type their address once and pick it at checkout. Later (branch 07) an
 *       order COPIES the address into itself, so editing an address never changes old orders.
 * WHERE: routes → controller → service → MODEL → MongoDB. Only address.service.js uses it.
 *
 * Business rules (invariants = things that must ALWAYS be true):
 *  - at most LIMITS.MAX_ADDRESSES (5) per customer          → checked in address.service.js
 *  - a customer with addresses has EXACTLY ONE default      → service logic + the unique
 *    partial index below, which makes "two defaults" impossible even if the code had a bug
 *  - every query filters by `user`, so nobody can touch another customer's address
 */
import mongoose from 'mongoose';
import toJSON from '../../db/plugins/toJSON.js';
import { ADDRESS_LABELS, PROVINCES, REGEX } from '../../config/constants.js';

const { Schema } = mongoose;

const addressSchema = new Schema(
  {
    // The OWNER. `ref: 'User'` tells Mongoose which model this id points to (for populate).
    // It is always set by the service from the logged-in user, never from the request body.
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // enum = only these values; `default` is used when the customer does not pick one
    label: {
      type: String,
      enum: { values: ADDRESS_LABELS, message: 'Invalid label' },
      default: 'Home',
    },
    // The person who receives the parcel (may differ from the account owner)
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      minlength: [2, 'Full name must be at least 2 characters'],
      maxlength: [60, 'Full name must be at most 60 characters'],
    },
    // The courier calls this number, so it is required here (unlike on the profile)
    phone: {
      type: String,
      required: [true, 'Phone is required'],
      trim: true,
      match: [REGEX.PK_PHONE, 'Phone must be 03XXXXXXXXX'],
    },
    addressLine1: {
      type: String,
      required: [true, 'Address line 1 is required'],
      trim: true,
      minlength: [5, 'Address line 1 must be at least 5 characters'],
      maxlength: [120, 'Address line 1 must be at most 120 characters'],
    },
    // Optional extra line (apartment, landmark…)
    addressLine2: {
      type: String,
      trim: true,
      maxlength: [120, 'Address line 2 must be at most 120 characters'],
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true,
      minlength: [2, 'City must be at least 2 characters'],
      maxlength: [50, 'City must be at most 50 characters'],
    },
    province: {
      type: String,
      required: [true, 'Province is required'],
      enum: { values: PROVINCES, message: 'Invalid province' },
    },
    postalCode: {
      type: String,
      required: [true, 'Postal code is required'],
      trim: true,
      match: [REGEX.POSTAL_CODE, 'Postal code must be 5 digits'],
    },
    // The shop only delivers inside Pakistan. Not editable by the client.
    country: { type: String, default: 'Pakistan', enum: ['Pakistan'] },
    // The address pre-selected at checkout. Exactly one per customer (see index below).
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }, // createdAt / updatedAt
);

/* ---------- Indexes ---------- */
// "List MY addresses" is the most common query → an index that starts with `user`.
addressSchema.index({ user: 1, createdAt: -1 });

// A UNIQUE PARTIAL index: the unique rule only applies to documents that match
// `partialFilterExpression`, i.e. only to DEFAULT addresses. So:
//   - a user may have many addresses with isDefault: false (they are not in this index)
//   - but only ONE with isDefault: true; a second one is refused by MongoDB (error 11000)
// This is a database-level safety net for the "exactly one default" rule.
// See docs/concepts/10-databases-and-indexes.md.
addressSchema.index(
  { user: 1 },
  {
    unique: true,
    partialFilterExpression: { isDefault: true },
    name: 'one_default_address_per_user',
  },
);

/* ---------- Methods ---------- */
// Branch 07: the plain COPY of this address that an order stores (a "snapshot").
// Only delivery fields are copied: no _id, owner, label or isDefault. Later edits to this
// address never change an order that was already placed.
addressSchema.methods.toSnapshot = function toSnapshot() {
  const { fullName, phone, addressLine1, addressLine2, city, province, postalCode, country } = this;
  return { fullName, phone, addressLine1, addressLine2, city, province, postalCode, country };
};

// Clean JSON output (no __v, no duplicate `id`)
addressSchema.plugin(toJSON);

// Reuse the model if it already exists (avoids "OverwriteModelError" on hot reload)
export default mongoose.models.Address || mongoose.model('Address', addressSchema);
