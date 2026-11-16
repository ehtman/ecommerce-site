
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import bcrypt from "bcryptjs";

import connectDB from "../config/db.js";
import User from "../modules/users/user.model.js";

const createAdmin = async () => {
  try {
    const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

    if (!ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
      throw new Error("Admin environment variables are required");
    }

    if (ADMIN_PASSWORD.length < 12) {
      throw new Error("Admin password must be at least 12 characters");
    }

    await connectDB();

    const email = ADMIN_EMAIL.trim().toLowerCase();

    const existingAdmin = await User.findOne({ email });

    if (existingAdmin) {
      throw new Error("An account with this email already exists");
    }

    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 12);

    const admin = await User.create({
      name: ADMIN_NAME,
      email,
      password: hashedPassword,
      role: "admin",
    });

    console.log("Admin created successfully:", admin.email);
  } catch (error) {
    console.error("Admin creation failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

createAdmin();