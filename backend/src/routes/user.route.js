const express = require("express");

const router = express.Router();

const userController = require("../controllers/user.controller");

const  userMiddleware  = require("../middlewares/user.middleware");

const {
  registerValidation,
  loginValidation,
  forgotPasswordValidation,
  resetPasswordValidation,
  updateProfileValidation,
} = require("../validations/user.validation");

// Authentication routes

router.post(
  "/register",
  registerValidation,
  userController.register
);

router.post(
  "/login",
  loginValidation,
  userController.login
);

router.post(
  "/logout",
  userController.logout
);

// Password reset routes

router.post(
  "/forgot-password",
  forgotPasswordValidation,
  userController.forgotPassword
);

router.post(
  "/reset-password/:token",
  resetPasswordValidation,
  userController.resetPassword
);

// Profile routes (Protected)

router.get(
  "/profile",
  userMiddleware,
  userController.getProfile
);

router.patch(
  "/profile",
  userMiddleware,
  updateProfileValidation,
  userController.updateProfile
);

module.exports = router;