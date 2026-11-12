
require("dotenv").config();

const connectDB = require("../config/db");
const mongoose = require("mongoose");
const Staff = require("../modules/staff/staff.model");

const createAdmin = async () => {
  try {
    const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

    if (!ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
      throw new Error("Admin environment variables are missing");
    }

    if (ADMIN_PASSWORD.length < 12) {
      throw new Error("Initial admin password must be at least 12 characters");
    }

    await connectDB();

    const email = ADMIN_EMAIL.trim().toLowerCase();

    const existingEmail = await Staff.findOne({
      email,
    });

    if (existingEmail) {
      throw new Error("A staff account with this email already exists");
    }

    const admin = await Staff.create({
      name: ADMIN_NAME,
      email,
      password: ADMIN_PASSWORD,
      role: "admin",
    });

    console.log("Initial Admin created successfully");
    console.log("Admin ID:", admin._id.toString());
    console.log("Admin Email:", admin.email);
  } catch (error) {
    console.error("Admin creation failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

createAdmin();
