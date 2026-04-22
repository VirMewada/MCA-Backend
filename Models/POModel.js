const mongoose = require("mongoose");

const POSchema = new mongoose.Schema(
  {
    vendor_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
    },
    po_number: {
      type: String,
      unique: true,
    },
    items: [
      {
        item_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Item",
          required: true,
        },

        quantity: Number,

        // 🔥 Core tracking
        received_quantity: { type: Number, default: 0 },

        // 🧠 NEW: where material is currently
        in_vendor: { type: Number, default: 0 },
        in_machining: { type: Number, default: 0 },
        in_testing: { type: Number, default: 0 },
        in_house: { type: Number, default: 0 },

        price: Number,
        total: Number,
        weight: Number,
      },
    ],

    total_amount: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["created", "in_progress", "completed", "cancelled"],
      default: "created",
    },
    timeline: [
      {
        event: {
          type: String,
          enum: [
            "po_created",
            "sent_to_vendor",
            "received",
            "sent_for_machining",
            "received_from_machining",
            "sent_for_testing",
            "received_from_testing",
            "qc_passed",
            "qc_failed",
            "closed",
          ],
        },

        item_id: mongoose.Schema.Types.ObjectId, // 🔥 add this
        quantity: Number,

        from: String, // optional but VERY useful
        to: String, // optional but VERY useful

        date: { type: Date, default: Date.now },
        note: String,
      },
    ],

    expected_delivery_date: Date,
    actual_delivery_date: Date,

    payment_terms: String,
    note: String,

    // 🧠 For analytics
    lead_time_days: Number,
    is_accepted: {
      type: Boolean,
      default: null, // null = pending
    },
    is_deleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PO", POSchema);
