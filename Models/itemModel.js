const mongoose = require("mongoose");

const ItemSchema = new mongoose.Schema(
  {
    // 🔹 Basic Info
    name: {
      type: String,
      required: true,
      trim: true,
    },

    code: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      index: true,
    },

    type: {
      type: String,
      enum: ["part", "assembly", "main"],
      required: true,
      index: true,
    },

    unit: {
      type: String,
      default: "kgs", // kg, pcs, etc.
    },

    stock: {
      type: Number,
      default: 0,
    },

    // 🔁 Recursive BOM (VERY IMPORTANT)
    children: [
      {
        item_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Item",
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          default: 1,
        },
      },
    ],

    // 💰 Costing (for parts + derived for assemblies/main)
    costing: {
      weight: {
        type: Number,
        default: 0,
      },

      rate: {
        type: Number,
        default: 0,
      },

      labour: {
        type: Number,
        default: 0,
      },

      latest_cost: {
        type: Number,
        default: 0,
      },

      cost_history: [
        {
          cost: Number,
          date: {
            type: Date,
            default: Date.now,
          },
        },
      ],
    },

    // 📦 Inventory Control
    min_stock: {
      type: Number,
      default: 0,
    },

    // 🧠 Smart Analytics (for reorder system)
    analytics: {
      avg_daily_usage: {
        type: Number,
        default: 0,
      },

      avg_lead_time: {
        type: Number,
        default: 0,
      },

      safety_stock: {
        type: Number,
        default: 10, // ✅ your default
      },

      safety_stock_mode: {
        type: String,
        enum: ["manual", "auto"],
        default: "manual",
      },
    },

    // 🏭 Vendor Mapping
    vendors: [
      {
        vendor_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Vendor",
        },
        last_price: Number,
        lead_time_days: Number,
      },
    ],

    // 🧾 Soft delete (IMPORTANT)
    is_deleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

ItemSchema.virtual("rawMat").get(function () {
  if (this.type !== "part") return 0;
  return this.costing.weight * this.costing.rate;
});

ItemSchema.virtual("total").get(function () {
  if (this.type === "part") {
    const rawMat = this.costing.weight * this.costing.rate;
    return rawMat + this.costing.labour;
  }

  // For assemblies/main → use latest_cost
  return this.costing.latest_cost;
});

ItemSchema.set("toJSON", { virtuals: true });
ItemSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Item", ItemSchema);
