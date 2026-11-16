
import * as authService from "./auth.service.js";

import {
  accessCookieOptions,
  refreshCookieOptions,
} from "../../utils/cookie-options.js";

// REGISTER
export const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters",
      });
    }

    const user = await authService.registerUser({
      name,
      email: email.trim().toLowerCase(),
      password,
    });

    res.status(201).json({
      success: true,
      message: "Registration successful",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

// LOGIN
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const result = await authService.loginUser({
      email: email.trim().toLowerCase(),
      password,
    });

    res.cookie(
      "accessToken",
      result.accessToken,
      accessCookieOptions
    );

    res.cookie(
      "refreshToken",
      result.refreshToken,
      refreshCookieOptions
    );

    res.status(200).json({
      success: true,
      message: "Login successful",
      user: {
        id: result.user._id,
        name: result.user.name,
        email: result.user.email,
        role: result.user.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

// REFRESH TOKEN
export const refresh = async (req, res, next) => {
  try {
    const token = req.cookies.refreshToken;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Refresh token required",
      });
    }

    const result = await authService.refreshUserToken(token);

    res.cookie(
      "accessToken",
      result.accessToken,
      accessCookieOptions
    );

    res.cookie(
      "refreshToken",
      result.refreshToken,
      refreshCookieOptions
    );

    res.status(200).json({
      success: true,
      message: "Tokens refreshed successfully",
    });
  } catch (error) {
    next(error);
  }
};

// LOGOUT
export const logout = async (req, res, next) => {
  try {
    await authService.logoutUser(req.user._id);

    res.clearCookie("accessToken", {
      ...accessCookieOptions,
      maxAge: undefined,
    });

    res.clearCookie("refreshToken", {
      ...refreshCookieOptions,
      maxAge: undefined,
    });

    res.status(200).json({
      success: true,
      message: "Logout successful",
    });
  } catch (error) {
    next(error);
  }
};
