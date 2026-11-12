require("dotenv").config();

const connectDB = require("../config/db");
const mongoose = require("mongoose");
const Staff = require("../modules/staff/staff.model");

const createManager = async () => {
  try {
    const { MANAGER_NAME, MANAGER_EMAIL, MANAGER_PASSWORD } = process.env;

    if (!MANAGER_NAME || !MANAGER_EMAIL || !MANAGER_PASSWORD) {
      throw new Error("Manager configuration is incomplete. Please check the environment variables.");
    }

    if (MANAGER_PASSWORD.length < 12) {
      throw new Error("Manager password must be at least 12 characters long.");
    }

    await connectDB();

    const email = MANAGER_EMAIL.trim().toLowerCase();

    const existingEmail = await Staff.findOne({
      email,
    });

    if (existingEmail) {
      throw new Error("A staff account with this email address already exists.");
    }

    const manager = await Staff.create({
      name: MANAGER_NAME,
      email,
      password: MANAGER_PASSWORD,
      role: "manager",
    });

    console.log("Manager account created successfully.");
    console.log("Manager ID:", manager._id.toString());
    console.log("Manager Email:", manager.email);
    await mongoose.disconnect();
  } catch (error) {
    console.error("Manager creation failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

createManager();