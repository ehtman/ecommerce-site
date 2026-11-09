
const Product = require("../models/product.model");
const mongoose = require("mongoose");
const Category = require("../models/category.model");

const ALLOWED_SORTS = {
  newest: { createdAt: -1 },
  price_asc: { price: 1 },
  price_desc: { price: -1 },
  rating: { ratingAverage: -1 },
  popular: { soldCount: -1 },
};

const escapeRegex = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getProducts = async (query) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(48, Math.max(1, parseInt(query.limit, 10) || 12));

  const filter = { isActive: true };

  if (query.keyword) {
    const keyword = String(query.keyword).trim().slice(0, 100);

    if (keyword) {
      filter.$text = { $search: keyword };
    }
  }

  if (query.category) {
    const Category = require("../models/category.model");
    const category = await Category.findOne({
      slug: query.category,
      isActive: true,
    }).select("_id");

    if (!category) {
      return {
        products: [],
        meta: { page, limit, total: 0, pages: 0 },
      };
    }

    filter.category = category._id;
  }

  if (query.minPrice !== undefined) {
    const min = Number(query.minPrice);
    if (!Number.isFinite(min) || min < 0) {
      const error = new Error("Invalid minimum price");
      error.statusCode = 400;
      throw error;
    }
    filter.price = { ...filter.price, $gte: min };
  }

  if (query.maxPrice !== undefined) {
    const max = Number(query.maxPrice);
    if (!Number.isFinite(max) || max < 0) {
      const error = new Error("Invalid maximum price");
      error.statusCode = 400;
      throw error;
    }
    filter.price = { ...filter.price, $lte: max };
  }

  if (
    filter.price?.$gte !== undefined &&
    filter.price?.$lte !== undefined &&
    filter.price.$gte > filter.price.$lte
  ) {
    const error = new Error("minPrice cannot exceed maxPrice");
    error.statusCode = 400;
    throw error;
  }

  if (query.rating !== undefined) {
    const rating = Number(query.rating);

    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      const error = new Error("Rating must be between 1 and 5");
      error.statusCode = 400;
      throw error;
    }

    filter.ratingAverage = { $gte: rating };
  }

  if (query.inStock === "true") {
    filter.stock = { $gt: 0 };
  }

  if (query.brand) {
    filter.brand = new RegExp(
      `^${escapeRegex(String(query.brand).trim())}$`,
      "i"
    );
  }

  const sort = ALLOWED_SORTS[query.sort] || ALLOWED_SORTS.newest;

  const [products, total] = await Promise.all([
    Product.find(filter)
      .populate("category", "name slug")
      .sort(query.keyword && !query.sort ? { score: { $meta: "textScore" } } : sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .select("-specifications"),
    Product.countDocuments(filter),
  ]);

  return {
    products,
    meta: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

const getProductBySlug = async (slug) => {
  if (!/^[a-z0-9-]+$/.test(slug)) {
    const error = new Error("Invalid product slug");
    error.statusCode = 400;
    throw error;
  }

  const product = await Product.findOne({
    slug,
    isActive: true,
  }).populate("category", "name slug");

  if (!product) {
    const error = new Error("Product not found");
    error.statusCode = 404;
    throw error;
  }

  return product;
};


// Generate slug
const generateSlug = (value) => {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
};

// Validate MongoDB ID
const validateId = (id) => {
  if (!mongoose.isValidObjectId(id)) {
    const error = new Error("Invalid product ID");
    error.statusCode = 400;
    throw error;
  }
};

// Validate category
const validateCategory = async (categoryId) => {
  if (!mongoose.isValidObjectId(categoryId)) {
    const error = new Error("Invalid category ID");
    error.statusCode = 400;
    throw error;
  }

  const category = await Category.findOne({
    _id: categoryId,
    isActive: true,
  });

  if (!category) {
    const error = new Error("Category not found or inactive");
    error.statusCode = 404;
    throw error;
  }

  return category;
};

// Check duplicate slug
const checkProductSlug = async (slug, excludeId = null) => {
  const filter = { slug };

  if (excludeId) {
    filter._id = { $ne: excludeId };
  }

  const exists = await Product.exists(filter);

  if (exists) {
    const error = new Error("Product slug already exists");
    error.statusCode = 409;
    throw error;
  }
};

// CREATE PRODUCT
const createProduct = async (data) => {
  const {
    name,
    slug,
    brand,
    description,
    price,
    compareAtPrice,
    images,
    category,
    stock,
    specifications,
  } = data;

  if (!name || name.trim().length < 2) {
    const error = new Error("Product name must contain at least 2 characters");
    error.statusCode = 400;
    throw error;
  }

  if (!description || !description.trim()) {
    const error = new Error("Product description is required");
    error.statusCode = 400;
    throw error;
  }

  if (price === undefined || !Number.isFinite(Number(price)) || Number(price) < 0) {
    const error = new Error("Valid product price is required");
    error.statusCode = 400;
    throw error;
  }

  if (compareAtPrice != null) {
    if (
      !Number.isFinite(Number(compareAtPrice)) ||
      Number(compareAtPrice) < 0
    ) {
      const error = new Error("Invalid compare-at price");
      error.statusCode = 400;
      throw error;
    }
  }

  if (compareAtPrice != null && Number(compareAtPrice) <= Number(price)) {
    const error = new Error("Compare-at price must be greater than selling price");
    error.statusCode = 400;
    throw error;
  }

  if (stock !== undefined && (!Number.isInteger(Number(stock)) || Number(stock) < 0)) {
    const error = new Error("Stock must be a non-negative integer");
    error.statusCode = 400;
    throw error;
  }

  await validateCategory(category);

  const finalSlug = generateSlug(slug || name);

  if (!finalSlug) {
    const error = new Error("Invalid product slug");
    error.statusCode = 400;
    throw error;
  }

  await checkProductSlug(finalSlug);

  const product = await Product.create({
    name: name.trim(),
    slug: finalSlug,
    brand,
    description: description.trim(),
    price: Number(price),
    compareAtPrice: compareAtPrice == null ? null : Number(compareAtPrice),
    images: images || [],
    category,
    stock: stock === undefined ? 0 : Number(stock),
    specifications: specifications || {},
  });

  return product.populate("category", "name slug");
};

// GET ALL PRODUCTS (ADMIN)
const getAllProducts = async (query) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(48, Math.max(1, parseInt(query.limit, 10) || 12));

  const filter = {};

  // Filter by active/inactive status
  if (query.isActive !== undefined) {
    if (!["true", "false"].includes(query.isActive)) {
      const error = new Error("Invalid isActive filter");
      error.statusCode = 400;
      throw error;
    }

    filter.isActive = query.isActive === "true";
  }

  // Search product
  if (query.keyword) {
    const keyword = String(query.keyword).trim().slice(0, 100);

    const regex = new RegExp(
      keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i"
    );

    filter.$or = [
      { name: regex },
      { brand: regex },
      { description: regex },
      { slug: regex },
    ];
  }

  // Filter by category ID
  if (query.category) {
    if (!mongoose.isValidObjectId(query.category)) {
      const error = new Error("Invalid category ID");
      error.statusCode = 400;
      throw error;
    }

    filter.category = query.category;
  }

  // Filter by stock
  if (query.inStock === "true") {
    filter.stock = { $gt: 0 };
  } else if (query.inStock === "false") {
    filter.stock = 0;
  }

  const sort = ALLOWED_SORTS[query.sort] || ALLOWED_SORTS.newest;

  const [products, total] = await Promise.all([
    Product.find(filter)
      .populate("category", "name slug")
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),

    Product.countDocuments(filter),
  ]);

  return {
    products,
    meta: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

// GET PRODUCT BY ID (ADMIN)
const getProductById = async (id) => {
  validateId(id);

  const product = await Product.findById(id)
    .populate("category", "name slug")
    .lean();

  if (!product) {
    const error = new Error("Product not found");
    error.statusCode = 404;
    throw error;
  }

  return product;
};

// UPDATE PRODUCT
const updateProduct = async (id, data) => {
  validateId(id);

  const product = await Product.findById(id);

  if (!product) {
    const error = new Error("Product not found");
    error.statusCode = 404;
    throw error;
  }

  const allowedFields = [
    "name",
    "slug",
    "brand",
    "description",
    "price",
    "compareAtPrice",
    "images",
    "category",
    "stock",
    "specifications",
  ];

  const updates = {};

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      updates[field] = data[field];
    }
  }

  if (updates.name !== undefined) {
    if (typeof updates.name !== "string") {
      const error = new Error("Invalid product name");
      error.statusCode = 400;
      throw error;
    }

    updates.name = updates.name.trim();

    if (updates.name.length < 2 || updates.name.length > 150) {
      const error = new Error("Product name must be between 2 and 150 characters");
      error.statusCode = 400;
      throw error;
    }
  }

  if (updates.description !== undefined) {
    if (typeof updates.description !== "string" || !updates.description.trim()) {
      const error = new Error("Product description is required");
      error.statusCode = 400;
      throw error;
    }

    updates.description = updates.description.trim();
  }

  if (updates.brand !== undefined) {
    if (typeof updates.brand !== "string") {
      const error = new Error("Invalid brand");
      error.statusCode = 400;
      throw error;
    }

    updates.brand = updates.brand.trim();
  }

  if (updates.price !== undefined) {
    if (!Number.isFinite(Number(updates.price)) || Number(updates.price) < 0) {
      const error = new Error("Invalid product price");
      error.statusCode = 400;
      throw error;
    }

    updates.price = Number(updates.price);
  }

  if (updates.compareAtPrice !== undefined) {
    if (
      updates.compareAtPrice !== null &&
      (!Number.isFinite(Number(updates.compareAtPrice)) ||
        Number(updates.compareAtPrice) < 0)
    ) {
      const error = new Error("Invalid compare-at price");
      error.statusCode = 400;
      throw error;
    }

    updates.compareAtPrice =
      updates.compareAtPrice === null
        ? null
        : Number(updates.compareAtPrice);
  }

  const finalPrice = updates.price ?? product.price;
  const finalComparePrice =
    updates.compareAtPrice !== undefined
      ? updates.compareAtPrice
      : product.compareAtPrice;

  if (
    finalComparePrice !== null &&
    finalComparePrice !== undefined &&
    finalComparePrice <= finalPrice
  ) {
    const error = new Error("Compare-at price must be greater than selling price");
    error.statusCode = 400;
    throw error;
  }

  if (updates.stock !== undefined) {
    if (!Number.isInteger(Number(updates.stock)) || Number(updates.stock) < 0) {
      const error = new Error("Stock must be a non-negative integer");
      error.statusCode = 400;
      throw error;
    }

    updates.stock = Number(updates.stock);
  }

  if (updates.slug !== undefined) {
    updates.slug = generateSlug(updates.slug);

    if (!updates.slug) {
      const error = new Error("Invalid product slug");
      error.statusCode = 400;
      throw error;
    }
  }

  if (updates.name && updates.slug === undefined) {
    updates.slug = generateSlug(updates.name);
  }

  if (updates.slug) {
    await checkProductSlug(updates.slug, id);
  }

  if (updates.category !== undefined) {
    await validateCategory(updates.category);
  }

  if (updates.images !== undefined && !Array.isArray(updates.images)) {
    const error = new Error("Images must be an array");
    error.statusCode = 400;
    throw error;
  }

  if (
    updates.specifications !== undefined &&
    (
      updates.specifications === null ||
      typeof updates.specifications !== "object" ||
      Array.isArray(updates.specifications)
    )
  ) {
    const error = new Error("Specifications must be an object");
    error.statusCode = 400;
    throw error;
  }

  Object.assign(product, updates);

  await product.save();

  return product.populate("category", "name slug");
};

// SOFT DELETE PRODUCT
const deleteProduct = async (id) => {
  validateId(id);

  const product = await Product.findById(id);

  if (!product) {
    const error = new Error("Product not found");
    error.statusCode = 404;
    throw error;
  }

  product.isActive = false;
  await product.save();

  return {
    message: "Product deactivated successfully",
  };
};

// ACTIVATE / DEACTIVATE PRODUCT
const updateProductStatus = async (id, isActive) => {
  validateId(id);

  if (typeof isActive !== "boolean") {
    const error = new Error("isActive must be a boolean");
    error.statusCode = 400;
    throw error;
  }

  const product = await Product.findById(id);

  if (!product) {
    const error = new Error("Product not found");
    error.statusCode = 404;
    throw error;
  }

  if (isActive) {
    await validateCategory(product.category);
  }

  product.isActive = isActive;
  await product.save();

  return product;
};

// UPDATE STOCK
const updateProductStock = async (id, stock) => {
  validateId(id);

  if (
    stock === undefined ||
    !Number.isInteger(Number(stock)) ||
    Number(stock) < 0
  ) {
    const error = new Error("Stock must be a non-negative integer");
    error.statusCode = 400;
    throw error;
  }

  const product = await Product.findByIdAndUpdate(
    id,
    { $set: { stock: Number(stock) } },
    { new: true, runValidators: true }
  ).populate("category", "name slug");

  if (!product) {
    const error = new Error("Product not found");
    error.statusCode = 404;
    throw error;
  }

  return product;
};




module.exports = {
  getProducts,
  getProductBySlug,

  // Admin methods
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  updateProductStatus,
  updateProductStock,
};

