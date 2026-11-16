import bcrypt from "bcryptjs";
import User from "../users/user.model.js";
import jwt from "jsonwebtoken";

import {
  generateAccessToken,
  generateRefreshToken,
} from "../../utils/generate-token.js";

import { createHash, timingSafeEqual } from "crypto";

const hashToken = (token) => createHash("sha256").update(token).digest("hex");

const compareTokenHash = (token, storedHash) => {
  const incoming = Buffer.from(hashToken(token), "hex");
  const stored = Buffer.from(storedHash, "hex");

  return incoming.length === stored.length && timingSafeEqual(incoming, stored);
};

// REGISTER
export const registerUser = async ({ name, email, password }) => {
  const existingUser = await User.findOne({ email });

  if (existingUser) {
    throw new Error("Email already registered");
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const user = await User.create({
    name,
    email,
    password: hashedPassword,
  });

  return user;
};

// LOGIN
export const loginUser = async ({ email, password }) => {
  const user = await User.findOne({ email }).select("+password");

  if (!user) {
    throw new Error("Invalid email or password");
  }

  if (!user.isActive) {
    throw new Error("Account is inactive");
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);

  if (!isPasswordValid) {
    throw new Error("Invalid email or password");
  }

  const accessToken = generateAccessToken(user._id);
  const refreshToken = generateRefreshToken(user._id);

  user.refreshTokenHash = hashToken(refreshToken);
  await user.save();

  return {
    user,
    accessToken,
    refreshToken,
  };
};

// REFRESH ACCESS TOKEN
export const refreshUserToken = async (refreshToken) => {
  let decoded;
  
  try {
    decoded = jwt.default.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  } catch {
    throw new Error("Invalid or expired refresh token");
  }

  const user = await User.findById(decoded.userId).select("+refreshTokenHash");

  if (
    !user ||
    !user.isActive ||
    !user.refreshTokenHash ||
    !compareTokenHash(refreshToken, user.refreshTokenHash)
  ) {
    throw new Error("Invalid refresh token");
  }

  const newAccessToken = generateAccessToken(user._id);
  const newRefreshToken = generateRefreshToken(user._id);

  // Rotate refresh token
  user.refreshTokenHash = hashToken(newRefreshToken);
  await user.save();

  return {
    user,
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  };
};

// LOGOUT
export const logoutUser = async (userId) => {
  await User.findByIdAndUpdate(userId, {
    $unset: { refreshTokenHash: 1 },
  });
};
