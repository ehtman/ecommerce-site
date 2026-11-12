const express = require("express");
const controller = require("./staff.controller");
const asyncHandler = require("../../utils/asyncHandler");

const router = express.Router();

router.post("/login", asyncHandler(controller.login));
router.post("/logout", controller.logout);

module.exports = router;