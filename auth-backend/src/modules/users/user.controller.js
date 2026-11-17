import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/ApiResponse.js';
import generateToken from '../../utils/generateToken.js';
import * as userService from './user.service.js';

export const changePassword = asyncHandler(async (req, res) => {
  const user = await userService.changePassword(req.user._id, req.body.currentPassword, req.body.newPassword);
  // Old tokens stop working, so we return a fresh one
  sendSuccess(res, 200, 'Password updated', { token: generateToken(user) });
});
