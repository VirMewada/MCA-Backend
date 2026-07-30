const mongoose = require("mongoose");

/**
 * A customer order for finished goods.
 *
 * Only `type: "main"` items can be ordered — that's enforced in the controller,
 * not here, so the error message can name the offending item.
 *
 * Orders are DEMAND, not stock movements. Nothing here changes an item's stock
 * until a dispatch is recorded, at which point the dispatched quantity is
 * issued from finished-goods stock.
 *
 * NEW collection — nothing existing reads or writes it.
 */

const STATUSES = [
  "draft",
  "confirmed",
  "in_production",
  "partially_dispatched",
  "dispatched",
  "closed",
  "cancelled",
];

const SalesOrderLineSchema = new mongoose.Schema(
  {
    item_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Item",
      required: true,
    },

    // Snapshot so the order still reads correctly if the item is renamed.
    name: String,
    full_code: String,
    unit: String,

    quantity: { type: Number, required: true, min: 0 },

    // Cumulative quantity actually sent. Partial dispatches add to this.
    dispatched_quantity: { type: Number, default: 0, min: 0 },

    price: { type: Number, default: 0 },
    total: { type: Number, default: 0 },

    note: { type: String, default: "" },
  },
  { _id: true }
);

const SalesOrderSchema = new mongoose.Schema(
  {
    so_number: { type: String, unique: true, index: true },

    party_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Party",
      required: true,
      index: true,
    },

    // The customer's own reference, e.g. their PO number against us.
    party_reference: { type: String, trim: true, default: "" },

    items: [SalesOrderLineSchema],

    status: {
      type: String,
      enum: STATUSES,
      default: "draft",
      index: true,
    },

    order_date: { type: Date, default: Date.now },
    expected_dispatch_date: Date,

    total_amount: { type: Number, default: 0 },
    gst_rate: { type: Number, default: 18 },
    gst_amount: { type: Number, default: 0 },
    grand_total: { type: Number, default: 0 },

    payment_terms: { type: String, trim: true, default: "" },
    note: { type: String, default: "" },

    timeline: [
      {
        event: {
          type: String,
          enum: [
            "created",
            "confirmed",
            "production_started",
            "dispatched",
            "closed",
            "cancelled",
            "reopened",
            "edited",
          ],
        },
        item_id: mongoose.Schema.Types.ObjectId,
        quantity: Number,
        from: String,
        to: String,
        person_name: String,
        note: String,
        date: { type: Date, default: Date.now },
      },
    ],

    is_deleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

SalesOrderSchema.index({ createdAt: -1 });
SalesOrderSchema.index({ "items.item_id": 1 });

/** True once every line has been fully dispatched. */
SalesOrderSchema.virtual("fullyDispatched").get(function () {
  if (!this.items?.length) return false;
  return this.items.every(
    (l) => (l.dispatched_quantity ?? 0) >= (l.quantity ?? 0)
  );
});

SalesOrderSchema.set("toJSON", { virtuals: true });
SalesOrderSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("SalesOrder", SalesOrderSchema);
module.exports.STATUSES = STATUSES;
