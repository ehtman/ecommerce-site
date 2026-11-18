/**
 * src/modules/categories/category.model.js – the Category collection: how the shop's
 * products are grouped ("Electronics", "Men" → "Shoes").
 *
 * WHAT: One document per category. A category may have a `parent`, which makes it a
 *       sub-category. Products (branch 04) will point to one category each.
 * WHY:  Customers browse by category, and the URL uses a readable SLUG instead of the id:
 *       /api/categories/mens-shoes. See docs/concepts/15-slugs-and-public-vs-admin-apis.md.
 * WHERE: routes → controller → service → MODEL → MongoDB. Used by category.service.js
 *       (and by the product service from branch 04).
 *
 * Business rules (invariants):
 *  - names are unique, ignoring upper/lower case ("Shoes" = "shoes")  → unique index below
 *  - every category has a unique slug, made from its name             → pre('validate') hook
 *  - at most TWO levels: a parent must be top-level, a category with
 *    children cannot become a child, and nothing is its own parent    → category.service.js
 */
import mongoose from 'mongoose';
import toJSON from '../../db/plugins/toJSON.js';
import imageSchema from '../../db/schemas/image.schema.js';
import { uniqueSlug } from '../../db/utils/slugify.js';
import { REGEX } from '../../config/constants.js';

const { Schema } = mongoose;

// "Compare text like a human": locale English, strength 2 = ignore upper/lower case
// (but not accents). Used by the unique name index and by the service's name check.
export const CASE_INSENSITIVE = Object.freeze({ locale: 'en', strength: 2 });

const categorySchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Category name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [50, 'Name must be at most 50 characters'],
    },
    // Never sent by the client: the hook below always builds it from the name.
    // `lowercase` + `match` are a safety net in case some code sets it by hand.
    slug: {
      type: String,
      lowercase: true,
      trim: true,
      match: [REGEX.SLUG, 'Invalid slug'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [300, 'Description must be at most 300 characters'],
      default: '',
    },
    // A SELF-reference: a category points to another category. null = top-level.
    parent: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    // Optional picture for menus. `default: undefined` = the field is simply absent
    // (not an empty object) when there is no image.
    image: { type: imageSchema, default: undefined },
    // Inactive = hidden from customers, but kept (products may still point to it).
    // Admins "switch a category off" instead of deleting it.
    isActive: { type: Boolean, default: true },
    // Lets admins choose the menu order: lower numbers come first
    sortOrder: {
      type: Number,
      default: 0,
      min: [0, 'Sort order must be 0–1000'],
      max: [1000, 'Sort order must be 0–1000'],
    },
  },
  { timestamps: true }, // createdAt / updatedAt
);

/* ---------- Indexes ---------- */
// Unique name, ignoring case: "Shoes" and "SHOES" cannot both exist. The `collation`
// tells MongoDB HOW to compare strings for this index. A duplicate → error 11000 → 409.
categorySchema.index({ name: 1 }, { unique: true, collation: CASE_INSENSITIVE });
// Unique slug: GET /api/categories/:slug must find exactly ONE category. It is also the
// last line of defence if two admins create "Shoes!" and "Shoes?" at the same moment.
categorySchema.index({ slug: 1 }, { unique: true });
// "Children of X, in menu order" and "is anyone's parent X?" both start with `parent`
categorySchema.index({ parent: 1, sortOrder: 1 });

/* ---------- Virtuals ---------- */
// `children` is NOT stored. Mongoose can fill it on demand with
// Category.find().populate('children'): "categories whose parent is my _id".
categorySchema.virtual('children', {
  ref: 'Category',
  localField: '_id',
  foreignField: 'parent',
});

/* ---------- Hooks ---------- */
// Runs before validation on every save(). A new category, or a renamed one, gets a fresh
// unique slug ("shoes", or "shoes-2" if "shoes" is taken by ANOTHER category).
categorySchema.pre('validate', async function setSlug() {
  // No name → nothing to build from; the `required` rule reports the real problem
  if (!this.name) return;
  if (this.isNew || this.isModified('name')) {
    // this.constructor = the Category model; this._id = skip my own slug when renaming
    this.slug = await uniqueSlug(this.constructor, this.name, this._id);
  }
});

// Clean JSON output (no __v, no duplicate `id`)
categorySchema.plugin(toJSON);

// Reuse the model if it already exists (avoids "OverwriteModelError" on hot reload)
export default mongoose.models.Category || mongoose.model('Category', categorySchema);
