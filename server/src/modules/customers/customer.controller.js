
const customerService = require("./customer.service");
const {
  setAuthCookie,
  clearAuthCookie,
} = require("../../utils/authCookie");

const COOKIE_NAME = "customer_token";

const register = async (req, res) => {
  const { customer, token } =
    await customerService.registerCustomer(req.body);

  setAuthCookie(res, COOKIE_NAME, token);

  res.status(201).json({
    success: true,
    message: "Customer registered successfully",
    data: { customer },
  });
};

const login = async (req, res) => {
  const { customer, token } =
    await customerService.loginCustomer(req.body);

  setAuthCookie(res, COOKIE_NAME, token);

  res.status(200).json({
    success: true,
    message: "Login successful",
    data: { customer },
  });
};

const logout = (req, res) => {
  clearAuthCookie(res, COOKIE_NAME);

  res.status(200).json({
    success: true,
    message: "Customer logged out successfully",
  });
};

module.exports = {
  register,
  login,
  logout,
};
