
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import bcrypt from "bcryptjs";

import connectDB from "../config/db.js";
import User from "../modules/users/user.model.js";

const createManager = async () => {
  try {
    const { MANAGER_NAME, MANAGER_EMAIL, MANAGER_PASSWORD } = process.env;

    if (!MANAGER_NAME || !MANAGER_EMAIL || !MANAGER_PASSWORD) {
      throw new Error("Admin environment variables are required");
    }

    if (MANAGER_PASSWORD.length < 12) {
      throw new Error("Admin password must be at least 12 characters");
    }

    await connectDB();

    const email = MANAGER_EMAIL.trim().toLowerCase();

    const existingAdmin = await User.findOne({ email });

    if (existingAdmin) {
      throw new Error("An account with this email already exists");
    }

    const hashedPassword = await bcrypt.hash(MANAGER_PASSWORD, 12);

    const manager = await User.create({
      name: MANAGER_NAME,
      email,
      password: hashedPassword,
      role: "manager",
    });

    console.log("Admin created successfully:", manager.email);
  } catch (error) {
    console.error("Admin creation failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

createManager();