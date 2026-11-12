const express = require("express");
const router = express.Router();

const asyncHandler = require("../utils/asyncHandler");


const adminCategoryController = require(
  "../controllers/category.controller"
);

const userMiddleware = require("../middlewares/user.middleware");
const adminMiddleware = require("../middlewares/admin.middleware");

// Authentication first, authorization second
router.use(userMiddleware);
router.use(adminMiddleware);

// CREATE CATEGORY
router.post(
  "/",
  asyncHandler(adminCategoryController.createCategory)
);


// UPDATE CATEGORY
router.patch(
  "/:id",
  asyncHandler(adminCategoryController.updateCategory)
);

// DELETE CATEGORY
router.delete(
  "/:id",
  asyncHandler(adminCategoryController.deleteCategory)
);

// ACTIVATE / DEACTIVATE CATEGORY
router.patch(
  "/:id/status",
  asyncHandler(adminCategoryController.updateCategoryStatus)
);

module.exports = router;
