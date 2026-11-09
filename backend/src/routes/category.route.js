
const express = require("express");
const router = express.Router();

const asyncHandler = require("../utils/asyncHandler");

const adminCategoryController = require(
  "../controllers/category.controller"
);

// Middlewares
const userMiddleware = require("../middlewares/user.middleware");
// const adminMiddleware = require("../middlewares/admin.middleware"); // will add later while confirming admin modules specifically

// Protect all admin category routes
router.use(userMiddleware);
// router.use(adminMiddleware);

// CREATE CATEGORY
router.post(
  "/",
  asyncHandler(adminCategoryController.createCategory)
);

// GET ALL CATEGORIES
router.get(
  "/",
  asyncHandler(adminCategoryController.getAllCategories)
);

// GET CATEGORY BY ID
router.get(
  "/:id",
  asyncHandler(adminCategoryController.getCategoryById)
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
