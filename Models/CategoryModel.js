const mongoose = require("mongoose");

const CategorySchema = new mongoose.Schema(
  {
    // 🔹 Basic Info
    name: {
      type: String,
      required: true,
      trim: true,
    },

    code: {
      type: String,
      required: true,
      trim: true,
      unique: true, // R1/1/1
      index: true,
    },

    // 🔗 Hierarchy (VERY IMPORTANT)
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
      index: true,
    },

    level: {
      type: Number,
      required: true, // 1 = root, 2 = child...
      index: true,
    },

    // 📂 Tree Optimization
    is_leaf: {
      type: Boolean,
      default: true, // becomes false when child is added
      index: true,
    },

    full_path: {
      type: String, // "R2 > SS Rod > Shaft"
      index: true,
    },

    // 🔢 Optional: ordering (for UI)
    order: {
      type: Number,
      default: 0,
    },

    // 🧾 Soft delete
    is_deleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

// 🔍 Indexes (IMPORTANT for scaling)
CategorySchema.index({ code: 1 });
CategorySchema.index({ parent: 1, level: 1 });
CategorySchema.index({ is_leaf: 1 });
CategorySchema.index({ full_path: "text" });

// 🧠 Virtual: children count (optional, useful for UI)
CategorySchema.virtual("hasChildren").get(function () {
  return !this.is_leaf;
});

CategorySchema.set("toJSON", { virtuals: true });
CategorySchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Category", CategorySchema);
