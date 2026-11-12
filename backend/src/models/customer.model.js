
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const customerSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },

    lastName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    phone: {
      type: String,
      trim: true,
      default: null,
    },

    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },

    avatar: {
      type: String,
      default: null,
    },

    addresses: [
      {
        fullName: {
          type: String,
          trim: true,
        },

        phone: {
          type: String,
          trim: true,
        },

        addressLine1: {
          type: String,
          trim: true,
        },

        addressLine2: {
          type: String,
          trim: true,
        },

        city: {
          type: String,
          trim: true,
        },

        state: {
          type: String,
          trim: true,
        },

        postalCode: {
          type: String,
          trim: true,
        },

        country: {
          type: String,
          trim: true,
          default: "Pakistan",
        },

        isDefault: {
          type: Boolean,
          default: false,
        },
      },
    ],

    isEmailVerified: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },

    lastLogin: {
      type: Date,
      default: null,
    },

    passwordChangedAt: {
      type: Date,
      select: false,
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
customerSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  this.password = await bcrypt.hash(this.password, 12);
});

// Compare password
customerSchema.methods.comparePassword = async function (
  candidatePassword
) {
  return bcrypt.compare(candidatePassword, this.password);
};

const Customer = mongoose.model("Customer", customerSchema);

module.exports = Customer;
