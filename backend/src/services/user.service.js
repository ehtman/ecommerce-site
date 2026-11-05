
const User = require("../models/user.model");

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

// ==========================================
// ERROR HANDLER
// ==========================================

const createError = (message, statusCode = 500) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

// ==========================================
// JWT TOKEN GENERATOR
// ==========================================

const generateToken = (userId) => {
  if (!process.env.JWT_SECRET) {
    throw createError("JWT configuration is missing", 500);
  }

  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    }
  );
};

// ==========================================
// MAILPIT CONFIGURATION
// ==========================================

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST || "127.0.0.1",
  port: Number(process.env.MAIL_PORT) || 1025,
  secure: false,
  auth:
    process.env.MAIL_USER && process.env.MAIL_PASS
      ? {
          user: process.env.MAIL_USER,
          pass: process.env.MAIL_PASS,
        }
      : undefined,
});

// Escape user-controlled text before inserting it into HTML.
const escapeHTML = (value = "") => {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[char];
  });
};

// ==========================================
// REGISTER USER
// ==========================================

const registerUser = async ({ name, email, password }) => {
  try {
    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      throw createError("Email is already registered", 409);
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
    });

    const token = generateToken(user._id);

    // Never return password or password hash.
    const userData = user.toObject();
    delete userData.password;

    return {
      user: userData,
      token,
    };
  } catch (error) {
    if (error.code === 11000) {
      throw createError("Email is already registered", 409);
    }

    throw error;
  }
};

// ==========================================
// LOGIN USER
// ==========================================

const loginUser = async ({ email, password }) => {
  const normalizedEmail = email.trim().toLowerCase();

  const user = await User.findOne({
    email: normalizedEmail,
  }).select("+password");

  if (!user) {
    throw createError("Invalid email or password", 401);
  }

  const isPasswordValid = await bcrypt.compare(
    password,
    user.password
  );

  if (!isPasswordValid) {
    throw createError("Invalid email or password", 401);
  }

  const token = generateToken(user._id);

  const userData = user.toObject();
  delete userData.password;

  return {
    user: userData,
    token,
  };
};

// ==========================================
// FORGOT PASSWORD
// ==========================================

const forgotPassword = async (email) => {
  const normalizedEmail = email.trim().toLowerCase();

  const user = await User.findOne({
    email: normalizedEmail,
  });

  // Generic response prevents account enumeration.
  if (!user) {
    return;
  }

  // Generate secure random reset token.
  const resetToken = crypto.randomBytes(32).toString("hex");

  // Store only its SHA-256 hash in MongoDB.
  const hashedResetToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  user.resetPasswordToken = hashedResetToken;

  // Token expires after 15 minutes.
  user.resetPasswordExpires = Date.now() + 15 * 60 * 1000;

  await user.save();

  const clientURL = process.env.CLIENT_URL;

  if (!clientURL) {
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    throw createError("Password reset configuration is missing", 500);
  }

  const resetURL = `${clientURL.replace(/\/$/, "")}/reset-password/${resetToken}`;

  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM || "noreply@ecommerce.local",
      to: user.email,
      subject: "Reset Your Ecommerce Password",

      html: `
        <div style="font-family: Arial, sans-serif;">
          <h2>Password Reset Request</h2>

          <p>Hello ${escapeHTML(user.name)},</p>

          <p>You requested to reset your password.</p>

          <p>Click the button below to continue:</p>

          <a
            href="${resetURL}"
            style="
              display: inline-block;
              padding: 12px 20px;
              background: #2563eb;
              color: white;
              text-decoration: none;
              border-radius: 5px;
            "
          >
            Reset Password
          </a>

          <p>This link expires in 15 minutes.</p>

          <p>If you did not request this, ignore this email.</p>
        </div>
      `,
    });
  } catch (error) {
    // Remove unused token if email delivery fails.
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();

    throw createError("Unable to send password reset email", 502);
  }
};

// ==========================================
// RESET PASSWORD
// ==========================================

const resetPassword = async (token, password) => {
  if (!token) {
    throw createError("Reset token is required", 400);
  }

  const hashedToken = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpires: {
      $gt: Date.now(),
    },
  }).select("+resetPasswordToken +resetPasswordExpires");

  if (!user) {
    throw createError("Invalid or expired reset token", 400);
  }

  user.password = await bcrypt.hash(password, 12);

  // Invalidate reset token after successful password reset.
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;

  await user.save();

  return {
    message: "Password reset successfully",
  };
};

// ==========================================
// GET USER PROFILE
// ==========================================

const getProfile = async (userId) => {
  const user = await User.findById(userId).select(
    "-password -resetPasswordToken -resetPasswordExpires"
  );

  if (!user) {
    throw createError("User not found", 404);
  }

  return user;
};

// ==========================================
// UPDATE USER PROFILE
// ==========================================

const updateProfile = async (userId, updateData) => {
  const allowedFields = {};

  // Only allow customers to update these fields.
  if (updateData.name !== undefined) {
    allowedFields.name = updateData.name.trim();
  }

  if (updateData.phone !== undefined) {
    allowedFields.phone = updateData.phone.trim();
  }

  if (Object.keys(allowedFields).length === 0) {
    throw createError("No valid profile fields provided", 400);
  }

  const user = await User.findByIdAndUpdate(
    userId,
    {
      $set: allowedFields,
    },
    {
      new: true,
      runValidators: true,
    }
  ).select(
    "-password -resetPasswordToken -resetPasswordExpires"
  );

  if (!user) {
    throw createError("User not found", 404);
  }

  return user;
};

// ==========================================
// EXPORT SERVICES
// ==========================================

module.exports = {
  registerUser,
  loginUser,
  forgotPassword,
  resetPassword,
  getProfile,
  updateProfile,
};
