
const productService = require("../services/product.service");

// CREATE PRODUCT
exports.createProduct = async (req, res) => {
  const product = await productService.createProduct(req.body);

  res.status(201).json({
    success: true,
    message: "Product created successfully",
    product,
  });
};

// GET ALL PRODUCTS
exports.getAllProducts = async (req, res) => {
  const result = await productService.getAllProducts(req.query);

  res.status(200).json({
    success: true,
    ...result,
  });
};

// GET PRODUCT BY ID
exports.getProductById = async (req, res) => {
  const product = await productService.getProductById(req.params.id);

  res.status(200).json({
    success: true,
    product,
  });
};

// UPDATE PRODUCT
exports.updateProduct = async (req, res) => {
  const product = await productService.updateProduct(
    req.params.id,
    req.body
  );

  res.status(200).json({
    success: true,
    message: "Product updated successfully",
    product,
  });
};

// DELETE PRODUCT (SOFT DELETE)
exports.deleteProduct = async (req, res) => {
  const result = await productService.deleteProduct(req.params.id);

  res.status(200).json({
    success: true,
    message: result.message,
  });
};

// ACTIVATE / DEACTIVATE PRODUCT
exports.updateProductStatus = async (req, res) => {
  const product = await productService.updateProductStatus(
    req.params.id,
    req.body.isActive
  );

  res.status(200).json({
    success: true,
    message: `Product ${product.isActive ? "activated" : "deactivated"} successfully`,
    product,
  });
};

// UPDATE STOCK
exports.updateProductStock = async (req, res) => {
  const product = await productService.updateProductStock(
    req.params.id,
    req.body.stock
  );

  res.status(200).json({
    success: true,
    message: "Product stock updated successfully",
    product,
  });
};
