const mongoose = require("mongoose");

const ItemSchema = new mongoose.Schema(
  {
    // 🔹 Basic Info
    name: {
      type: String,
      required: true,
      trim: true,
    },
    po_default_name: {
      type: String,
      default: "",
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
    full_code: {
      type: String,
      required: true,
      unique: true,
      index: true,
      immutable: true,
    },

    item_number: {
      type: Number,
      required: true,
      immutable: true,
    },

    category_snapshot: {
      full_path: { type: String, required: true },
      code: { type: String, required: true },
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
        // ADDITIVE — expected scrap/wastage for this line, as a percentage.
        // A 5 here means "consume 1.05x the quantity when building". Existing
        // BOM lines have no value and read as 0, i.e. exactly today's
        // behaviour.
        scrap_pct: {
          type: Number,
          default: 0,
          min: 0,
          max: 100,
        },
      },
    ],

    // ADDITIVE — how this item is obtained.
    //
    //   null (default)  →  derive it: children.length > 0 means "make",
    //                      otherwise "buy". This is what every existing
    //                      document reads as, so behaviour is unchanged.
    //   "make"          →  force manufactured
    //   "buy"           →  force purchased, even if a BOM exists (e.g. a
    //                      wound stator you normally wind in-house but
    //                      sometimes buy from an outside winder)
    //
    // `type` (part/assembly/main) is deliberately left alone — it stays a
    // display/grouping label. This field is the source of truth for whether
    // an item can be built.
    procurement_type: {
      type: String,
      enum: ["buy", "make", null],
      default: null,
    },

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
    // Add this field inside ItemSchema.analytics, alongside the existing ones:

    analytics: {
      avg_daily_usage: { type: Number, default: 0 },
      avg_lead_time: { type: Number, default: 0 },
      safety_stock: { type: Number, default: 10 },
      safety_stock_mode: {
        type: String,
        enum: ["manual", "auto"],
        default: "manual",
      },

      // NEW: what the analytics engine currently recommends min_stock be set
      // to. Always populated by runAnalyticsForAllItems, regardless of mode --
      // in "manual" mode this is just a suggestion the UI can surface next to
      // the real min_stock; in "auto" mode it's what min_stock actually gets
      // set to.
      suggested_min_stock: {
        type: Number,
        default: 0,
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

// Whether this item can be manufactured. Explicit procurement_type wins;
// otherwise fall back to "does it have a BOM".
ItemSchema.virtual("isMakeable").get(function () {
  if (this.procurement_type === "make") return true;
  if (this.procurement_type === "buy") return false;
  return (this.children?.length ?? 0) > 0;
});

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

ItemSchema.index({ category: 1, item_number: 1 }, { unique: true });
ItemSchema.index({ "children.item_id": 1 });
ItemSchema.index({ is_deleted: 1 });

module.exports = mongoose.model("Item", ItemSchema);
