import { User } from '../models.js';
import ApiError from '../../utils/ApiError.js';
import sendEmail from '../../emails/sendEmail.js';
import { passwordChangedTemplate } from '../../emails/templates.js';

export async function changePassword(userId, currentPassword, newPassword) {
  const user = await User.findById(userId).select('+password');
  if (user.authProvider !== 'local' && !user.password) {
    throw new ApiError(400, 'Google accounts do not have a password. Use "Forgot password" to create one.');
  }
  if (!(await user.comparePassword(currentPassword))) {
    throw new ApiError(401, 'Current password is incorrect', [{ field: 'currentPassword', message: 'Current password is incorrect' }]);
  }
  if (currentPassword === newPassword) {
    throw new ApiError(400, 'New password must be different', [{ field: 'newPassword', message: 'New password must be different' }]);
  }
  user.password = newPassword; // hashed by the pre-save hook, sets passwordChangedAt
  await user.save();
  await sendEmail({ to: user.email, ...passwordChangedTemplate(user.name) });
  return user;
}
