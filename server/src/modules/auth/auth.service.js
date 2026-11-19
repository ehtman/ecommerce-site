/**
 * src/modules/auth/auth.service.js – the BUSINESS LOGIC of authentication.
 *
 * Layers: routes → controller → SERVICE → model.
 * A service knows nothing about HTTP (no req/res). It receives plain values, talks to the
 * database, and either returns a result or throws an ApiError. That makes it reusable
 * (from a script, a test, another service) and easy to test.
 */
import env from '../../config/env.js';
import { User } from '../models.js';
import ApiError from '../../utils/ApiError.js';
import sendEmail from '../../emails/sendEmail.js';
import {
  verifyEmailTemplate,
  resetPasswordTemplate,
  passwordChangedTemplate,
} from '../../emails/templates.js';
import { googleVerifier } from './google.verifier.js';

// Creates and saves a user. For email+password accounts it also creates the
// email-verification token and returns it, so the caller can email it.
async function createUser(data) {
  const user = new User(data);
  let verifyToken = null;
  if (user.authProvider === 'local') verifyToken = user.createEmailVerifyToken();
  await user.save(); // the pre-save hook hashes the password here
  return { user, verifyToken };
}

/** Register a new customer and email them a verification link. */
export async function registerUser({ name, email, password }) {
  // Friendly early check. (The unique index is the real guarantee if two requests race.)
  if (await User.exists({ email })) {
    throw new ApiError(409, 'Email already registered', [
      { field: 'email', message: 'Email already registered' },
    ]);
  }
  // We pick ONLY the fields we expect and force role 'customer'. Whatever else the
  // client sends (role: 'admin', isEmailVerified: true…) is ignored.
  const { user, verifyToken } = await createUser({ name, email, password, role: 'customer' });

  // Email AFTER the database work succeeded (no email for a user that was never saved)
  await sendEmail({ to: user.email, ...verifyEmailTemplate(user.name, verifyToken) });
  return user;
}

/** Check email + password. Used by customer login and admin login. */
export async function loginUser(email, password, { requireAdmin = false } = {}) {
  // The password is `select: false`, so ask for it explicitly
  const user = await User.findOne({ email }).select('+password');
  // SAME message for "no such email" and "wrong password", so attackers cannot find out
  // which emails are registered ("user enumeration").
  if (!user || !(await user.comparePassword(password))) {
    throw new ApiError(401, 'Invalid email or password');
  }
  if (!user.isActive) throw new ApiError(403, 'Your account has been disabled');
  if (requireAdmin && user.role !== 'admin') throw new ApiError(403, 'Admin access only');

  user.lastLoginAt = new Date();
  // validateModifiedOnly: only validate the field we changed (faster, safer)
  await user.save({ validateModifiedOnly: true });
  return user;
}

/** Mark the email as verified if the emailed token is valid and not expired. */
export async function verifyEmail(token) {
  const user = await User.findByEmailToken(token);
  if (!user) throw new ApiError(400, 'Verification link is invalid or has expired');
  user.isEmailVerified = true;
  // Remove the token so the same link cannot be used twice ("single use")
  user.emailVerifyTokenHash = undefined;
  user.emailVerifyExpires = undefined;
  await user.save({ validateModifiedOnly: true });
  return user;
}

/** Send a NEW verification email (a new token replaces the old one). */
export async function resendVerification(userId) {
  const user = await User.findById(userId);
  if (user.isEmailVerified) throw new ApiError(400, 'Email is already verified');
  const token = user.createEmailVerifyToken();
  await user.save({ validateModifiedOnly: true });
  await sendEmail({ to: user.email, ...verifyEmailTemplate(user.name, token) });
}

/** Email a reset link, but only to active email+password accounts. */
export async function forgotPassword(email) {
  const user = await User.findOne({ email, authProvider: 'local', isActive: true });
  // Unknown email → do nothing, but the controller sends the SAME response either way,
  // so this route cannot be used to test which emails exist.
  if (!user) return;
  const token = user.createPasswordResetToken();
  await user.save({ validateModifiedOnly: true });
  await sendEmail({ to: user.email, ...resetPasswordTemplate(user.name, token) });
}

/** Set a new password using the emailed reset token. */
export async function resetPassword(token, newPassword) {
  const user = await User.findByResetToken(token);
  if (!user) throw new ApiError(400, 'Reset link is invalid or has expired');
  user.password = newPassword; // pre-save hook hashes it and sets passwordChangedAt
  user.passwordResetTokenHash = undefined; // single use
  user.passwordResetExpires = undefined;
  await user.save();
  // Security notice: if this was not the owner, they find out
  await sendEmail({ to: user.email, ...passwordChangedTemplate(user.name) });
}

/** Sign in (or sign up) with a Google ID token. */
export async function googleLogin(credential) {
  // Feature switched off when no client id is configured
  if (!env.GOOGLE_CLIENT_ID) throw new ApiError(500, 'Google login is not configured');

  // 1) Ask Google's library whether the token is real
  let payload;
  try {
    payload = await googleVerifier.verify(credential);
  } catch {
    throw new ApiError(401, 'Invalid Google credential');
  }
  if (!payload?.email_verified) throw new ApiError(401, 'Google email is not verified');

  const email = payload.email.toLowerCase();

  // 2) Find the matching user, in this order:
  //    a) already linked to this Google account (payload.sub = Google's user id)
  let user = await User.findOne({ googleId: payload.sub });
  //    b) same email registered with a password → link the Google id to that account
  if (!user) {
    user = await User.findOne({ email });
    if (user) {
      // Admins must use email+password (admin login has stricter protection)
      if (user.role === 'admin') {
        throw new ApiError(403, 'Admins must log in with email and password');
      }
      user.googleId = payload.sub;
      user.isEmailVerified = true; // Google proved the user owns this email
      await user.save({ validateModifiedOnly: true });
    }
  }
  //    c) nobody → create a new customer account (no password needed)
  if (!user) {
    ({ user } = await createUser({
      name: (payload.name || email.split('@')[0]).slice(0, 50), // fit the 50-char limit
      email,
      googleId: payload.sub,
      authProvider: 'google',
      // Google's profile photo URL (if the person has one) becomes their avatar
      avatar: payload.picture ? { url: payload.picture } : undefined,
    }));
  }

  // 3) Same checks as normal login
  if (user.role === 'admin') {
    throw new ApiError(403, 'Admins must log in with email and password');
  }
  if (!user.isActive) throw new ApiError(403, 'Your account has been disabled');
  user.lastLoginAt = new Date();
  await user.save({ validateModifiedOnly: true });
  return user;
}
