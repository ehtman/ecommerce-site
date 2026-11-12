
const Staff = require("./staff.model");
const generateToken = require("../../utils/generateToken");

const loginStaff = async ({ email, password }) => {
  if (!email || !password) {
    throw Object.assign(
      new Error("Email and password are required"),
      { statusCode: 400 }
    );
  }

  const staff = await Staff.findOne({
    email: email.trim().toLowerCase(),
  }).select("+password");

  if (!staff || !(await staff.comparePassword(password))) {
    throw Object.assign(
      new Error("Invalid email or password"),
      { statusCode: 401 }
    );
  }

  if (!staff.isActive) {
    throw Object.assign(
      new Error("Your account is inactive"),
      { statusCode: 403 }
    );
  }

  staff.lastLogin = new Date();
  await staff.save();

  const token = generateToken({
    id: staff._id,
    type: "staff",
    role: staff.role,
  });

  return { staff, token };
};

module.exports = {
  loginStaff,
};
