
const Customer = require("./customer.model");
const generateToken = require("../../utils/generateToken");

const registerCustomer = async ({ name, email, password }) => {
  if (!name || !email || !password) {
    throw Object.assign(
      new Error("Name, email and password are required"),
      { statusCode: 400 }
    );
  }

  if (password.length < 8) {
    throw Object.assign(
      new Error("Password must be at least 8 characters"),
      { statusCode: 400 }
    );
  }

  const normalizedEmail = email.trim().toLowerCase();

  const existingCustomer = await Customer.findOne({
    email: normalizedEmail,
  });

  if (existingCustomer) {
    throw Object.assign(
      new Error("Email is already registered"),
      { statusCode: 409 }
    );
  }

  const customer = await Customer.create({
    name: name.trim(),
    email: normalizedEmail,
    password,
  });

  const token = generateToken({
    id: customer._id,
    type: "customer",
  });

  return { customer, token };
};

const loginCustomer = async ({ email, password }) => {
  if (!email || !password) {
    throw Object.assign(
      new Error("Email and password are required"),
      { statusCode: 400 }
    );
  }

  const customer = await Customer.findOne({
    email: email.trim().toLowerCase(),
  }).select("+password");

  if (!customer || !(await customer.comparePassword(password))) {
    throw Object.assign(
      new Error("Invalid email or password"),
      { statusCode: 401 }
    );
  }

  if (!customer.isActive) {
    throw Object.assign(
      new Error("Your account is inactive"),
      { statusCode: 403 }
    );
  }

  const token = generateToken({
    id: customer._id,
    type: "customer",
  });

  return { customer, token };
};

module.exports = {
  registerCustomer,
  loginCustomer,
};
