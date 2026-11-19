/**
 * src/modules/users/user.model.js – the User collection: its shape, rules and helpers.
 *
 * A Mongoose MODEL = schema (which fields, types, rules) + methods + a MongoDB collection.
 * Layers: routes → controller → service → MODEL → MongoDB. Only services use models.
 *
 * Security ideas you will see here:
 *  - passwords are HASHED with bcrypt (one-way; we can check a password but never read it)
 *  - secret fields use `select: false`, so normal queries never load them
 *  - email/reset tokens: we email the PLAIN token but store only its SHA-256 HASH,
 *    so a leaked database cannot be used to reset anyone's password
 */
import crypto from 'node:crypto'; // Node's built-in cryptography (random bytes, hashing)
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import toJSON from '../../db/plugins/toJSON.js';
import { ROLES, AUTH_PROVIDERS, REGEX, TOKEN_TTL } from '../../config/constants.js';

const { Schema } = mongoose;
// bcrypt "cost": each +1 doubles the hashing time. 10 is a good balance for a web app.
const SALT_ROUNDS = 10;
// Fast one-way hash for random tokens (they are long and random, so bcrypt is not needed)
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const userSchema = new Schema(
  {
    // [rule, message] pairs: if the rule fails, Mongoose reports that message
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true, // remove spaces at the start/end
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [50, 'Name must be at most 50 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true, // creates a UNIQUE INDEX: the database itself refuses duplicates
      lowercase: true, // "Ali@X.com" and "ali@x.com" are the same account
      trim: true,
      match: [REGEX.EMAIL, 'Email is invalid'],
    },
    // Optional Pakistani mobile number (03XXXXXXXXX). The customer can add, change or
    // clear it on their profile. Not unique: two family members may share one phone.
    phone: {
      type: String,
      trim: true,
      match: [REGEX.PK_PHONE, 'Phone must be 03XXXXXXXXX'],
    },
    // Profile picture: { url, publicId } like every other image (db/schemas/image.schema.js),
    // but NOT that sub-schema: a Google photo lives on googleusercontent.com, not Cloudinary,
    // and has no publicId. Optional; set from Google on first sign-in (auth.service.js).
    avatar: {
      url: { type: String, trim: true },
      publicId: { type: String, trim: true }, // only for pictures we uploaded to Cloudinary
    },
    password: {
      type: String,
      select: false, // never loaded unless a query asks with .select('+password')
      // Required only for email+password accounts; Google accounts may have none
      required: [
        function requiredForLocal() {
          return this.authProvider === AUTH_PROVIDERS.LOCAL;
        },
        'Password is required',
      ],
    },
    // enum = only these values are allowed; new users are always customers
    role: { type: String, enum: Object.values(ROLES), default: ROLES.CUSTOMER },
    authProvider: {
      type: String,
      enum: Object.values(AUTH_PROVIDERS),
      default: AUTH_PROVIDERS.LOCAL,
    },
    // sparse: the unique rule ignores users WITHOUT a googleId (most local users)
    googleId: { type: String, unique: true, sparse: true },
    isEmailVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true }, // false = account disabled by an admin

    // Hashes of the emailed tokens + their expiry dates (all hidden by default)
    emailVerifyTokenHash: { type: String, select: false },
    emailVerifyExpires: { type: Date, select: false },
    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
    passwordChangedAt: Date, // when the password last changed (shown to the user, audits)
    // A counter that goes up on every password change. Each JWT carries the number it
    // was made with ("v"). protect() rejects tokens whose number is out of date, which
    // logs out every old session at once. (See docs/concepts/jwt-and-sessions.md for why a
    // counter beats comparing timestamps: JWT times are only precise to the second.)
    tokenVersion: { type: Number, default: 0 },
    lastLoginAt: Date,
  },
  // timestamps: Mongoose adds and updates `createdAt` and `updatedAt` automatically
  { timestamps: true },
);

/* ---------- Indexes ----------
 * An index is like a book's index: MongoDB finds matching documents without reading
 * the whole collection. Add one for every field you search by often. */
userSchema.index({ role: 1 }); // e.g. "find all admins"
userSchema.index({ emailVerifyTokenHash: 1 }, { sparse: true }); // verify-email lookup
userSchema.index({ passwordResetTokenHash: 1 }, { sparse: true }); // reset-password lookup

/* ---------- Hooks (code that runs automatically) ---------- */
// Before every save: hash the password, but ONLY if it is new or was changed.
// (Hashing an already-hashed password would make the real password stop working.)
userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password') || !this.password) return;
  this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
  // On a CHANGE (not on sign-up): remember when, and bump the token version so every
  // token created before this moment stops working.
  if (!this.isNew) {
    this.passwordChangedAt = new Date();
    this.tokenVersion += 1;
  }
});

// Google has already verified the email address, so trust it.
userSchema.pre('validate', function googleVerified() {
  if (this.authProvider === AUTH_PROVIDERS.GOOGLE) this.isEmailVerified = true;
});

/* ---------- Instance methods (called on ONE user: user.comparePassword(...)) ---------- */

// Checks a typed password against the stored hash. Needs .select('+password') first.
userSchema.methods.comparePassword = function comparePassword(plain) {
  if (!this.password) return Promise.resolve(false); // e.g. Google account without password
  return bcrypt.compare(plain, this.password);
};

// true if a token made with `tokenVersionInJwt` is out of date (password changed since).
// Tokens from before this feature have no version (undefined) → also out of date.
userSchema.methods.isTokenOutdated = function isTokenOutdated(tokenVersionInJwt) {
  return tokenVersionInJwt !== this.tokenVersion;
};

// Creates a random verification token. Returns the PLAIN token (to email);
// only its hash + expiry are stored on the user (the caller must then save()).
userSchema.methods.createEmailVerifyToken = function createEmailVerifyToken() {
  const token = crypto.randomBytes(32).toString('hex'); // 64 random hex characters
  this.emailVerifyTokenHash = sha256(token);
  this.emailVerifyExpires = new Date(Date.now() + TOKEN_TTL.EMAIL_VERIFY_MS);
  return token;
};

// Same idea for "forgot password", with a shorter expiry
userSchema.methods.createPasswordResetToken = function createPasswordResetToken() {
  const token = crypto.randomBytes(32).toString('hex');
  this.passwordResetTokenHash = sha256(token);
  this.passwordResetExpires = new Date(Date.now() + TOKEN_TTL.PASSWORD_RESET_MS);
  return token;
};

/* ---------- Statics (called on the MODEL: User.findByEmailToken(...)) ---------- */

// Finds the user whose stored hash matches this token AND whose link has not expired.
userSchema.statics.findByEmailToken = function findByEmailToken(token) {
  return this.findOne({
    emailVerifyTokenHash: sha256(token), // hash what we received, compare hashes
    emailVerifyExpires: { $gt: new Date() }, // $gt = "greater than" → still in the future
  }).select('+emailVerifyTokenHash +emailVerifyExpires');
};

userSchema.statics.findByResetToken = function findByResetToken(token) {
  return this.findOne({
    passwordResetTokenHash: sha256(token),
    passwordResetExpires: { $gt: new Date() },
  }).select('+passwordResetTokenHash +passwordResetExpires');
};

// Hide secrets whenever a user is turned into JSON
userSchema.plugin(toJSON);

// Reuse the model if it already exists (avoids "OverwriteModelError" on hot reload)
export default mongoose.models.User || mongoose.model('User', userSchema);
