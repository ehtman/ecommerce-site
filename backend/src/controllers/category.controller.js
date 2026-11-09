
const categoryService = require("../services/category.service");

// CREATE CATEGORY
exports.createCategory = async (req, res) => {
  const category = await categoryService.createCategory(req.body);

  res.status(201).json({
    success: true,
    message: "Category created successfully",
    category,
  });
};

// GET ALL CATEGORIES (INCLUDING INACTIVE)
exports.getAllCategories = async (req, res) => {
  const categories = await categoryService.getAllCategories();

  res.status(200).json({
    success: true,
    count: categories.length,
    categories,
  });
};

// GET SINGLE CATEGORY BY ID
exports.getCategoryById = async (req, res) => {
  const category = await categoryService.getCategoryById(req.params.id);

  res.status(200).json({
    success: true,
    category,
  });
};

// UPDATE CATEGORY
exports.updateCategory = async (req, res) => {
  const category = await categoryService.updateCategory(
    req.params.id,
    req.body
  );

  res.status(200).json({
    success: true,
    message: "Category updated successfully",
    category,
  });
};

// DELETE CATEGORY
exports.deleteCategory = async (req, res) => {
  const result = await categoryService.deleteCategory(req.params.id);

  res.status(200).json({
    success: true,
    message: result.message,
  });
};

// ACTIVATE / DEACTIVATE CATEGORY
exports.updateCategoryStatus = async (req, res) => {
  const category = await categoryService.updateCategoryStatus(
    req.params.id,
    req.body.isActive
  );

  res.status(200).json({
    success: true,
    message: `Category ${category.isActive ? "activated" : "deactivated"} successfully`,
    category,
  });
};
