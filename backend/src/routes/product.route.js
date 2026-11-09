
const express = require("express");
const router = express.Router();

const asyncHandler = require("../utils/asyncHandler");

const productController = require(
  "../controllers/product.controller"
);

const userMiddleware = require("../middlewares/user.middleware");
// const adminMiddleware = require("../middlewares/admin.middleware"); // will add later while confirming admin modules specifically

// Protect all admin product routes
router.use(userMiddleware);
// router.use(adminMiddleware);

// CREATE PRODUCT
router.post(
  "/",
  asyncHandler(productController.createProduct)
);

// GET ALL PRODUCTS
router.get(
  "/",
  asyncHandler(productController.getAllProducts)
);

// GET PRODUCT BY ID
router.get(
  "/:id",
  asyncHandler(productController.getProductById)
);

// UPDATE PRODUCT
router.patch(
  "/:id",
  asyncHandler(productController.updateProduct)
);

// DELETE PRODUCT
router.delete(
  "/:id",
  asyncHandler(productController.deleteProduct)
);

// ACTIVATE / DEACTIVATE PRODUCT
router.patch(
  "/:id/status",
  asyncHandler(productController.updateProductStatus)
);

// UPDATE STOCK
router.patch(
  "/:id/stock",
  asyncHandler(productController.updateProductStock)
);

module.exports = router;
