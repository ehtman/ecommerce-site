import { OAuth2Client } from 'google-auth-library';
import env from '../../config/env.js';
import { User } from '../models.js';
import ApiError from '../../utils/ApiError.js';
import sendEmail from '../../emails/sendEmail.js';
import {
  verifyEmailTemplate, resetPasswordTemplate, passwordChangedTemplate,
} from '../../emails/templates.js';

// Creates a user. For local accounts it also generates the email-verification token.
async function createUser(data) {
  const user = new User(data);
  let verifyToken = null;
  if (user.authProvider === 'local') verifyToken = user.createEmailVerifyToken();
  await user.save();
  return { user, verifyToken };
}

export async function registerUser({ name, email, password }) {
  if (await User.exists({ email })) {
    throw new ApiError(409, 'Email already registered', [{ field: 'email', message: 'Email already registered' }]);
  }
  // role is never taken from the request – new users are always customers
  const { user, verifyToken } = await createUser({ name, email, password, role: 'customer' });

  // Email is sent AFTER the database work succeeded
  await sendEmail({ to: user.email, ...verifyEmailTemplate(user.name, verifyToken) });
  return user;
}

export async function loginUser(email, password, { requireAdmin = false } = {}) {
  const user = await User.findOne({ email }).select('+password');
  // Same message for "no such email" and "wrong password"
  if (!user || !(await user.comparePassword(password))) {
    throw new ApiError(401, 'Invalid email or password');
  }
  if (!user.isActive) throw new ApiError(403, 'Your account has been disabled');
  if (requireAdmin && user.role !== 'admin') throw new ApiError(403, 'Admin access only');

  user.lastLoginAt = new Date();
  await user.save({ validateModifiedOnly: true });
  return user;
}

export async function verifyEmail(token) {
  const user = await User.findByEmailToken(token);
  if (!user) throw new ApiError(400, 'Verification link is invalid or has expired');
  user.isEmailVerified = true;
  user.emailVerifyTokenHash = undefined;
  user.emailVerifyExpires = undefined;
  await user.save({ validateModifiedOnly: true });
  return user;
}

export async function resendVerification(userId) {
  const user = await User.findById(userId);
  if (user.isEmailVerified) throw new ApiError(400, 'Email is already verified');
  const token = user.createEmailVerifyToken();
  await user.save({ validateModifiedOnly: true });
  await sendEmail({ to: user.email, ...verifyEmailTemplate(user.name, token) });
}

export async function forgotPassword(email) {
  const user = await User.findOne({ email, authProvider: 'local', isActive: true });
  // Always behave the same, whether the email exists or not
  if (!user) return;
  const token = user.createPasswordResetToken();
  await user.save({ validateModifiedOnly: true });
  await sendEmail({ to: user.email, ...resetPasswordTemplate(user.name, token) });
}

export async function resetPassword(token, newPassword) {
  const user = await User.findByResetToken(token);
  if (!user) throw new ApiError(400, 'Reset link is invalid or has expired');
  user.password = newPassword; // the pre-save hook hashes it and sets passwordChangedAt
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpires = undefined;
  await user.save();
  await sendEmail({ to: user.email, ...passwordChangedTemplate(user.name) });
}

// ---------- Google sign-in ----------
const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

export async function googleLogin(credential) {
  if (!env.GOOGLE_CLIENT_ID) throw new ApiError(500, 'Google login is not configured');

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: env.GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch {
    throw new ApiError(401, 'Invalid Google credential');
  }
  if (!payload?.email_verified) throw new ApiError(401, 'Google email is not verified');

  const email = payload.email.toLowerCase();

  // 1) Already linked to Google
  let user = await User.findOne({ googleId: payload.sub });
  // 2) Same email exists → link the Google id
  if (!user) {
    user = await User.findOne({ email });
    if (user) {
      if (user.role === 'admin') throw new ApiError(403, 'Admins must log in with email and password');
      user.googleId = payload.sub;
      user.isEmailVerified = true;
      await user.save({ validateModifiedOnly: true });
    }
  }
  // 3) Nobody → create a new customer
  if (!user) {
    ({ user } = await createUser({
      name: (payload.name || email.split('@')[0]).slice(0, 50),
      email,
      googleId: payload.sub,
      authProvider: 'google',
    }));
  }

  if (user.role === 'admin') throw new ApiError(403, 'Admins must log in with email and password');
  if (!user.isActive) throw new ApiError(403, 'Your account has been disabled');
  user.lastLoginAt = new Date();
  await user.save({ validateModifiedOnly: true });
  return user;
}
