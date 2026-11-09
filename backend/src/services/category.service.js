const mongoose = require("mongoose");
const Category = require("../models/category.model");

// Generate URL-friendly slug without an additional package.
const generateSlug = (value) => {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
};

// Validate MongoDB ObjectId.
const validateId = (id) => {
  if (!mongoose.isValidObjectId(id)) {
    const error = new Error("Invalid category ID");
    error.statusCode = 400;
    throw error;
  }
};

// Check whether a slug is already being used.
const checkSlug = async (slug, excludeId = null) => {
  const query = { slug };

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  const exists = await Category.exists(query);

  if (exists) {
    const error = new Error("Category slug already exists");
    error.statusCode = 409;
    throw error;
  }
};

// Validate parent category and prevent circular hierarchy.
const validateParent = async (parentId, categoryId = null) => {
  if (!parentId) return null;

  validateId(parentId);

  if (categoryId && parentId.toString() === categoryId.toString()) {
    const error = new Error("A category cannot be its own parent");
    error.statusCode = 400;
    throw error;
  }

  const parent = await Category.findById(parentId);

  if (!parent || !parent.isActive) {
    const error = new Error("Parent category not found or inactive");
    error.statusCode = 404;
    throw error;
  }

  // Prevent assigning one of this category's descendants as its parent.
  let current = parent;
  const visited = new Set();

  while (current) {
    const currentId = current._id.toString();

    if (visited.has(currentId)) {
      const error = new Error("Circular category hierarchy detected");
      error.statusCode = 400;
      throw error;
    }

    visited.add(currentId);

    if (categoryId && currentId === categoryId.toString()) {
      const error = new Error("Cannot assign a child category as parent");
      error.statusCode = 400;
      throw error;
    }

    if (!current.parent) break;

    current = await Category.findById(current.parent);
  }

  return parent;
};

// CREATE CATEGORY
exports.createCategory = async (data) => {
  const { name, slug, description, image, parent } = data;

  if (!name || name.trim().length < 2) {
    const error = new Error("Category name must contain at least 2 characters");
    error.statusCode = 400;
    throw error;
  }

  const finalSlug = generateSlug(slug || name);

  if (!finalSlug) {
    const error = new Error("A valid category slug is required");
    error.statusCode = 400;
    throw error;
  }

  await checkSlug(finalSlug);

  if (parent) {
    await validateParent(parent);
  }

  return Category.create({
    name: name.trim(),
    slug: finalSlug,
    description,
    image,
    parent: parent || null,
  });
};

// GET ALL CATEGORIES (ADMIN)
exports.getAllCategories = async () => {
  return Category.find()
    .populate({
      path: "parent",
      select: "name slug isActive",
    })
    .select("name slug description image parent isActive createdAt updatedAt")
    .sort({ createdAt: -1 })
    .lean();
};

// GET CATEGORY BY ID
exports.getCategoryById = async (id) => {
  validateId(id);

  const category = await Category.findById(id)
    .populate({
      path: "parent",
      select: "name slug isActive",
    })
    .lean();

  if (!category) {
    const error = new Error("Category not found");
    error.statusCode = 404;
    throw error;
  }

  return category;
};

// UPDATE CATEGORY
exports.updateCategory = async (id, data) => {
  validateId(id);

  const category = await Category.findById(id);

  if (!category) {
    const error = new Error("Category not found");
    error.statusCode = 404;
    throw error;
  }

  const allowedFields = ["name", "slug", "description", "image", "parent"];

  const updates = {};

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      updates[field] = data[field];
    }
  }

  if (updates.name !== undefined) {
    updates.name = updates.name.trim();

    if (updates.name.length < 2 || updates.name.length > 60) {
      const error = new Error(
        "Category name must be between 2 and 60 characters",
      );
      error.statusCode = 400;
      throw error;
    }
  }

  if (updates.slug !== undefined) {
    updates.slug = generateSlug(updates.slug);

    if (!updates.slug) {
      const error = new Error("Invalid category slug");
      error.statusCode = 400;
      throw error;
    }
  }

  // Regenerate slug if name changes and slug is not explicitly supplied.
  if (updates.name && updates.slug === undefined) {
    updates.slug = generateSlug(updates.name);
  }

  if (updates.slug) {
    await checkSlug(updates.slug, id);
  }

  if (updates.parent !== undefined) {
    await validateParent(updates.parent, id);
    updates.parent = updates.parent || null;
  }

  Object.assign(category, updates);

  await category.save();

  return category;
};

// DELETE CATEGORY
exports.deleteCategory = async (id) => {
  validateId(id);

  const category = await Category.findById(id);

  if (!category) {
    const error = new Error("Category not found");
    error.statusCode = 404;
    throw error;
  }

  // Prevent deletion if child categories exist.
  const hasChildren = await Category.exists({
    parent: id,
  });

  if (hasChildren) {
    const error = new Error(
      "Cannot delete category. Please remove or reassign its child categories first.",
    );
    error.statusCode = 409;
    throw error;
  }

  await Category.findByIdAndDelete(id);

  return { message: "Category deleted successfully" };
};

// ACTIVATE / DEACTIVATE CATEGORY
exports.updateCategoryStatus = async (id, isActive) => {
  validateId(id);

  if (typeof isActive !== "boolean") {
    const error = new Error("isActive must be a boolean");
    error.statusCode = 400;
    throw error;
  }

  const category = await Category.findById(id);

  if (!category) {
    const error = new Error("Category not found");
    error.statusCode = 404;
    throw error;
  }

  if (isActive) {
    await validateParent(category.parent);
  }
  if (!isActive) {
    const hasActiveChildren = await Category.exists({
      parent: id,
      isActive: true,
    });

    if (hasActiveChildren) {
      const error = new Error("Deactivate or reassign child categories first");
      error.statusCode = 409;
      throw error;
    }
  }
  category.isActive = isActive;
  await category.save();

  return category;
};
