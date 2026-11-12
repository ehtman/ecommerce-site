
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const customerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },

    phone: {
      type: String,
      trim: true,
      default: null,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    isEmailVerified: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Hash password before saving
customerSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  this.password = await bcrypt.hash(this.password, 12);
});

// Compare password during login
customerSchema.methods.comparePassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

// Never expose password in JSON
customerSchema.set("toJSON", {
  transform: function (doc, ret) {
    delete ret.password;
    return ret;
  },
});

module.exports = mongoose.model("Customer", customerSchema);
