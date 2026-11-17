// server/src/modules/users/user.model.js
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import toJSON from '../../db/plugins/toJSON.js';
import { ROLES, AUTH_PROVIDERS, REGEX, TOKEN_TTL } from '../../config/constants.js';

const { Schema } = mongoose;
const SALT_ROUNDS = 10;
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const userSchema = new Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true,
            minlength: [2, 'Name must be at least 2 characters'],
            maxlength: [50, 'Name must be at most 50 characters'] },
    email: { type: String, required: [true, 'Email is required'], unique: true,
             lowercase: true, trim: true, match: [REGEX.EMAIL, 'Email is invalid'] },
    password: {
      type: String, select: false,
      required: [function () { return this.authProvider === AUTH_PROVIDERS.LOCAL; },
                 'Password is required'],
    },
    role: { type: String, enum: Object.values(ROLES), default: ROLES.CUSTOMER },
    authProvider: { type: String, enum: Object.values(AUTH_PROVIDERS), default: AUTH_PROVIDERS.LOCAL },
    googleId: { type: String, unique: true, sparse: true },
    isEmailVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },

    emailVerifyTokenHash:   { type: String, select: false },
    emailVerifyExpires:     { type: Date,   select: false },
    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpires:   { type: Date,   select: false },
    passwordChangedAt: Date,
    lastLoginAt: Date,
  },
  { timestamps: true },
);

/* ---------- Indexes ---------- */
userSchema.index({ role: 1 });
userSchema.index({ emailVerifyTokenHash: 1 }, { sparse: true });
userSchema.index({ passwordResetTokenHash: 1 }, { sparse: true });

/* ---------- Hooks ---------- */
// Hash the password only when it was created or changed.
userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password') || !this.password) return;
  this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
  if (!this.isNew) this.passwordChangedAt = new Date(Date.now() - 1000);
});
// Google users are verified by Google.
userSchema.pre('validate', function googleVerified() {
  if (this.authProvider === AUTH_PROVIDERS.GOOGLE) this.isEmailVerified = true;
});

/* ---------- Instance methods ---------- */
userSchema.methods.comparePassword = function comparePassword(plain) {
  if (!this.password) return Promise.resolve(false);   // needs .select('+password')
  return bcrypt.compare(plain, this.password);
};
// true if the password changed after the JWT was issued (iat in seconds)
userSchema.methods.changedPasswordAfter = function changedPasswordAfter(jwtIat) {
  return Boolean(this.passwordChangedAt) && this.passwordChangedAt.getTime() > jwtIat * 1000;
};
// Returns the PLAIN token (to email). Only the hash is saved.
userSchema.methods.createEmailVerifyToken = function createEmailVerifyToken() {
  const token = crypto.randomBytes(32).toString('hex');
  this.emailVerifyTokenHash = sha256(token);
  this.emailVerifyExpires = new Date(Date.now() + TOKEN_TTL.EMAIL_VERIFY_MS);
  return token;
};
userSchema.methods.createPasswordResetToken = function createPasswordResetToken() {
  const token = crypto.randomBytes(32).toString('hex');
  this.passwordResetTokenHash = sha256(token);
  this.passwordResetExpires = new Date(Date.now() + TOKEN_TTL.PASSWORD_RESET_MS);
  return token;
};

/* ---------- Statics ---------- */
userSchema.statics.findByEmailToken = function findByEmailToken(token) {
  return this.findOne({ emailVerifyTokenHash: sha256(token), emailVerifyExpires: { $gt: new Date() } })
             .select('+emailVerifyTokenHash +emailVerifyExpires');
};
userSchema.statics.findByResetToken = function findByResetToken(token) {
  return this.findOne({ passwordResetTokenHash: sha256(token), passwordResetExpires: { $gt: new Date() } })
             .select('+passwordResetTokenHash +passwordResetExpires');
};

userSchema.plugin(toJSON);
export default mongoose.models.User || mongoose.model('User', userSchema);
