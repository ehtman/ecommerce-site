
const jwt = require("jsonwebtoken");

const generateToken = ({ id, type, role }) => {
  const isCustomer = type === "customer";
  const isStaff = type === "staff";

  if (!isCustomer && !isStaff) {
    throw new Error("Invalid account type");
  }

  const secret = isCustomer
    ? process.env.CUSTOMER_JWT_SECRET
    : process.env.STAFF_JWT_SECRET;

  const expiresIn = isCustomer
    ? process.env.CUSTOMER_JWT_EXPIRES_IN || "1d"
    : process.env.STAFF_JWT_EXPIRES_IN || "8h";

  if (!secret) {
    throw new Error(`${type.toUpperCase()}_JWT_SECRET is missing`);
  }

  const payload = {
    sub: id.toString(),
    type,
  };

  if (isStaff) {
    if (!role) {
      throw new Error("Staff role is required");
    }

    payload.role = role;
  }

  return jwt.sign(payload, secret, { expiresIn });
};

module.exports = generateToken;
