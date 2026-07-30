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
        po_name: { type: String, trim: true, default: "" },
        quantity: Number,
        received_quantity: { type: Number, default: 0 },
        in_vendor: { type: Number, default: 0 },
        in_machining: { type: Number, default: 0 },
        in_testing: { type: Number, default: 0 },
        in_house: { type: Number, default: 0 },
        price: Number,
        total: Number,
        weight: Number,

        // NEW -- traces this line back to where it came from, when this PO is
        // a "job" (machining/testing) spun off from another PO. Null for a
        // normal material PO line.
        origin_po_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "PO",
          default: null,
        },
        origin_item_id: {
          // the specific line's own _id on the origin PO -- NOT the origin
          // PO's item_id (master Item ref). This is what
          // updateStatus/rejectToOrigin match against.
          type: mongoose.Schema.Types.ObjectId,
          default: null,
        },

        // NEW -- for permanently rejecting a quantity you've decided not to
        // take back from the vendor.
        written_off_quantity: { type: Number, default: 0 },
        // Of the written-off quantity, how much was also excluded from
        // billing (i.e. you don't pay for it). billable_quantity for costing
        // purposes = quantity - billing_adjusted_quantity.
        billing_adjusted_quantity: { type: Number, default: 0 },
      },
    ],

    // Add this top-level field alongside status/gst_rate/etc:
    job_type: {
      type: String,
      enum: ["material", "machining", "testing"],
      default: "material",
    },

    // Extend the existing timeline.event enum to also allow:
    //   "write_off", "job_created", "rejected_to_origin", "reopened"
    // e.g.:
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
            "write_off", // NEW
            "job_created", // NEW
            "rejected_to_origin", // NEW
            "reopened", // NEW
          ],
        },
        item_id: mongoose.Schema.Types.ObjectId,
        quantity: Number,
        from: String,
        to: String,
        date: { type: Date, default: Date.now },
        note: String,
      },
    ],

    // total_amount: {
    //   type: Number,
    //   required: true,
    // },
    // // Add these three fields to POSchema, alongside total_amount:

    total_amount: {
      type: Number,
      required: true,
    },

    // NEW
    gst_rate: {
      type: Number,
      default: 18, // percent
    },
    gst_amount: {
      type: Number,
      default: 0,
    },
    grand_total: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["created", "in_progress", "completed", "cancelled"],
      default: "created",
    },
    // timeline: [
    //   {
    //     event: {
    //       type: String,
    //       enum: [
    //         "po_created",
    //         "sent_to_vendor",
    //         "received",
    //         "sent_for_machining",
    //         "received_from_machining",
    //         "sent_for_testing",
    //         "received_from_testing",
    //         "qc_passed",
    //         "qc_failed",
    //         "closed",
    //       ],
    //     },

    //     item_id: mongoose.Schema.Types.ObjectId, // 🔥 add this
    //     quantity: Number,

    //     from: String, // optional but VERY useful
    //     to: String, // optional but VERY useful

    //     date: { type: Date, default: Date.now },
    //     note: String,
    //   },
    // ],

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
