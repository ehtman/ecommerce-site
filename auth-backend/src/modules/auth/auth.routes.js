
import express from "express";

import {
  register,
  login,
  logout,
  refresh,
} from "./auth.controller.js";

import authenticate from "../../middlewares/authenticate.middleware.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/refresh", refresh);
router.post("/logout", authenticate, logout);

export default router;
