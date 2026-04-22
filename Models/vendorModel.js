const mongoose = require("mongoose");

const VendorSchema = new mongoose.Schema(
  {
    // 🔹 Basic Info
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    code: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },

    // 📞 Contact Info (IMPORTANT for WhatsApp)
    phone: {
      type: String,
      required: true,
      trim: true,
    },

    country_code: {
      type: String,
      default: "91",
    },

    email: {
      type: String,
      trim: true,
      default: "",
    },

    address: {
      type: String,
      default: "",
    },

    gst: {
      type: String,
      default: "",
    },

    // 🧠 Vendor Performance (future use)
    analytics: {
      avg_lead_time: {
        type: Number,
        default: 0,
      },

      reliability_score: {
        type: Number,
        default: 0, // future AI / scoring
      },
    },

    // 🏭 Items supplied (optional reverse mapping)
    items: [
      {
        item_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Item",
        },
        last_price: Number,
        lead_time_days: Number,
      },
    ],

    // 📝 Notes
    note: {
      type: String,
      default: "",
    },
    payment_terms: {
      type: String,
      default: "",
    },

    // 🧾 Soft delete
    is_deleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Vendor", VendorSchema);
