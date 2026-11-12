
const PERMISSIONS = Object.freeze({
  CUSTOMERS_READ: "customers.read",
  CUSTOMERS_UPDATE: "customers.update",
  CUSTOMERS_DELETE: "customers.delete",

  STAFF_CREATE: "staff.create",
  STAFF_READ: "staff.read",
  STAFF_UPDATE: "staff.update",
  STAFF_DELETE: "staff.delete",

  PRODUCTS_CREATE: "products.create",
  PRODUCTS_READ: "products.read",
  PRODUCTS_UPDATE: "products.update",
  PRODUCTS_DELETE: "products.delete",

  CATEGORIES_CREATE: "categories.create",
  CATEGORIES_READ: "categories.read",
  CATEGORIES_UPDATE: "categories.update",
  CATEGORIES_DELETE: "categories.delete",

  ORDERS_READ: "orders.read",
  ORDERS_UPDATE: "orders.update",
  ORDERS_DELETE: "orders.delete",
});

const ROLE_PERMISSIONS = Object.freeze({
  admin: Object.freeze(["*"]),

  manager: Object.freeze([
    PERMISSIONS.ORDERS_READ,
    PERMISSIONS.ORDERS_UPDATE,
  ]),
});

const hasPermission = (role, permission) => {
  const permissions = ROLE_PERMISSIONS[role];

  if (!permissions) return false;

  return (
    permissions.includes("*") ||
    permissions.includes(permission)
  );
};

module.exports = {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  hasPermission,
};
