/**
 * src/modules/users/user.service.js – business logic for the logged-in user's account:
 * editing the profile (name, phone) and changing the password.
 *
 * Layers: routes → controller → SERVICE → model. No req/res here; errors are ApiErrors.
 * Used by: user.controller.js.
 */
import { User } from '../models.js';
import ApiError from '../../utils/ApiError.js';
import sendEmail from '../../emails/sendEmail.js';
import { passwordChangedTemplate } from '../../emails/templates.js';

/**
 * Update the profile. Only `name` and `phone` may change.
 *
 * MASS ASSIGNMENT: a lazy version would be `Object.assign(user, req.body)`. Then a customer
 * could send { "role": "admin" } or { "isEmailVerified": true } and promote themself.
 * Instead we copy the two allowed fields by name and ignore everything else.
 */
export async function updateProfile(userId, { name, phone }) {
  const user = await User.findById(userId);
  // `undefined` = the field was not sent → leave it as it is (partial update)
  if (name !== undefined) user.name = name;
  // "" or null = "remove my phone number" → undefined makes Mongoose delete the field
  if (phone !== undefined) user.phone = phone || undefined;
  // validateModifiedOnly: check only the fields we changed (an old document with some
  // other now-invalid field should not block a name change)
  await user.save({ validateModifiedOnly: true });
  return user;
}

export async function changePassword(userId, currentPassword, newPassword) {
  const user = await User.findById(userId).select('+password'); // need the hash to compare
  // Google-only accounts have no password to "change". They can create one via reset.
  if (!user.password) {
    throw new ApiError(
      400,
      'Google accounts do not have a password. Use "Forgot password" to create one.',
    );
  }
  // Prove it's really the owner (a stolen, still-open session cannot change the password)
  if (!(await user.comparePassword(currentPassword))) {
    throw new ApiError(401, 'Current password is incorrect', [
      { field: 'currentPassword', message: 'Current password is incorrect' },
    ]);
  }
  if (currentPassword === newPassword) {
    throw new ApiError(400, 'New password must be different', [
      { field: 'newPassword', message: 'New password must be different' },
    ]);
  }
  user.password = newPassword; // hashed by the pre-save hook, which also sets passwordChangedAt
  await user.save();
  await sendEmail({ to: user.email, ...passwordChangedTemplate(user.name) });
  return user;
}
