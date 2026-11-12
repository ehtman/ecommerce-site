const jwt = require("jsonwebtoken");
const User = require("../models/user.model");

module.exports = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    const token =
      req.cookies?.token ||
      (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication required. Please login.",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select(
      "_id name email role isActive",
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found.",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Account is deactivated.",
      });
    }

    req.user = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    next();
  } catch (error) {
    if (
      error.name === "JsonWebTokenError" ||
      error.name === "TokenExpiredError"
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired authentication token.",
      });
    }

    next(error);
  }
};
