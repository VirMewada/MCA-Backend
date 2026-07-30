const mongoose = require("mongoose");

/**
 * A single manufacturing event: "we made N of item X, and these are the
 * components it ate".
 *
 * This is a NEW collection — nothing existing reads or writes it, so adding
 * it cannot affect current data.
 *
 * The consumed lines are a point-in-time snapshot of the BOM, not a live
 * reference. If someone edits the BOM of a wound stator next month, this
 * record still shows what was actually consumed today. That property is the
 * whole reason to store the lines rather than re-deriving them later.
 */
const BuildSchema = new mongoose.Schema(
  {
    item_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Item",
      required: true,
      index: true,
    },

    // Denormalised so build history stays readable even if an item is
    // renamed or soft-deleted later.
    item_snapshot: {
      name: String,
      full_code: String,
      type: String,
      unit: String,
    },

    quantity: {
      type: Number,
      required: true,
      min: 0,
    },

    // What this build actually consumed, one row per direct child.
    consumed: [
      {
        item_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Item",
          required: true,
        },
        name: String,
        full_code: String,
        unit: String,

        // BOM quantity per one unit of the parent, at build time.
        per_unit: Number,
        // Scrap percentage applied, at build time.
        scrap_pct: { type: Number, default: 0 },
        // Total actually deducted = per_unit * quantity * (1 + scrap_pct/100)
        total_quantity: Number,

        // Component stock immediately after the deduction.
        stock_after: Number,
      },
    ],

    // Unit cost of the parent at build time, and the resulting total.
    // Snapshotted because costing.latest_cost moves over time.
    unit_cost: { type: Number, default: 0 },
    total_cost: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ["completed", "reversed"],
      default: "completed",
      index: true,
    },

    // Set when this build is undone, pointing at the reversing build.
    reversed_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Build",
      default: null,
    },
    reverses: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Build",
      default: null,
    },

    person_name: { type: String, trim: true },
    note: { type: String, default: "" },

    // True when the build ran without a Mongo transaction (standalone mongod
    // in local dev). Useful when auditing an inconsistency.
    non_atomic: { type: Boolean, default: false },
  },
  { timestamps: true }
);

BuildSchema.index({ createdAt: -1 });
BuildSchema.index({ "consumed.item_id": 1 });

module.exports = mongoose.model("Build", BuildSchema);
