const express = require("express");
const controller = require("./customer.controller");
const asyncHandler = require("../../utils/asyncHandler");

const router = express.Router();

router.post("/register", asyncHandler(controller.register));
router.post("/login", asyncHandler(controller.login));
router.post("/logout", controller.logout);

module.exports = router;