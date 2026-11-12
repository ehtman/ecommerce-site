
const staffService = require("./staff.service");
const {
  setAuthCookie,
  clearAuthCookie,
} = require("../../utils/authCookie");

const COOKIE_NAME = "staff_token";

const login = async (req, res) => {
  const { staff, token } =
    await staffService.loginStaff(req.body);

  setAuthCookie(res, COOKIE_NAME, token);

  res.status(200).json({
    success: true,
    message: "Staff login successful",
    data: { staff },
  });
};

const logout = (req, res) => {
  clearAuthCookie(res, COOKIE_NAME);

  res.status(200).json({
    success: true,
    message: "Staff logged out successfully",
  });
};

module.exports = {
  login,
  logout,
};
