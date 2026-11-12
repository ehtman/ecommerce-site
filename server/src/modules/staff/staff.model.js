
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const staffSchema = new mongoose.Schema(
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

    role: {
      type: String,
      enum: ["admin", "manager"],
      required: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    lastLogin: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Hash password before saving
staffSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  this.password = await bcrypt.hash(this.password, 12);
});

// Compare password during login
staffSchema.methods.comparePassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

// Never expose password in JSON
staffSchema.set("toJSON", {
  transform: function (doc, ret) {
    delete ret.password;
    return ret;
  },
});

module.exports = mongoose.model("Staff", staffSchema);
