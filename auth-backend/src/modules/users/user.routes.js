
import express from "express";

import { getProfile } from "./user.controller.js";

import authenticate from "../../middlewares/authenticate.middleware.js";
import authorize from "../../middlewares/authorize.middleware.js";

import { PERMISSIONS } from "../../config/permissions.js";

const router = express.Router();

// Any authenticated user can access their profile
router.get(
  "/profile",
  authenticate,
  authorize(PERMISSIONS.PROFILE_READ),
  getProfile
);

// Admin and Manager can view users
router.get(
  "/admin",
  authenticate,
  authorize(PERMISSIONS.USERS_READ),
  (req, res) => {
    res.status(200).json({
      success: true,
      message: "You have permission to read users",
      authenticatedUser: req.user.name,
    });
  }
);

// Admin and Manager can access reports
router.get(
  "/reports",
  authenticate,
  authorize(PERMISSIONS.REPORTS_READ),
  (req, res) => {
    res.status(200).json({
      success: true,
      message: "Reports accessed successfully",
    });
  }
);

// Only Admin can manage roles
router.put(
  "/roles",
  authenticate,
  authorize(PERMISSIONS.ROLES_MANAGE),
  (req, res) => {
    res.status(200).json({
      success: true,
      message: "Role management access granted",
    });
  }
);

// Any authenticated user can update their own profile
router.put(
  "/profile",
  authenticate,
  authorize(PERMISSIONS.PROFILE_UPDATE),
  (req, res) => {
    res.status(200).json({
      success: true,
      message: "Profile update permission granted",
    });
  }
);

export default router;
