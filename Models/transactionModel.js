const mongoose = require("mongoose");

const TransactionSchema = new mongoose.Schema(
  {
    item_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Item",
      required: true,
    },

    // OUT of stock:  issue, consume, unbuild_remove
    // INTO stock:    receive, produce, unbuild_return
    //
    //   "issue"           — stock left the store (manual)
    //   "receive"         — stock came in (manual)
    //   "consume"         — ADDITIVE: a component was eaten by a build
    //   "produce"         — ADDITIVE: a parent item was created by a build
    //   "unbuild_return"  — ADDITIVE: a component put back by a reversal
    //   "unbuild_remove"  — ADDITIVE: a parent taken back off the shelf
    //
    // The original two values are untouched, so every existing row still
    // validates against this enum.
    type: {
      type: String,
      enum: [
        "issue",
        "receive",
        "consume",
        "produce",
        "unbuild_return",
        "unbuild_remove",
      ],
      required: true,
    },

    quantity: {
      type: Number,
      required: true,
    },

    person_name: {
      type: String,
      trim: true,
    },

    note: {
      type: String,
      default: "",
    },

    /* ---------------- ADDITIVE: build linkage ---------------- */

    // Groups every row written by a single build into one auditable set.
    // Null on all pre-existing rows and on manual issue/receive.
    build_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Build",
      default: null,
      index: true,
    },

    // On a "consume" row this is the parent that was built; on a "produce"
    // row it's null. Lets you answer "what did this shaft go into?".
    parent_item_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Item",
      default: null,
    },

    // Stock level immediately after this movement was applied. Recorded at
    // write time so history can't drift from the item's current stock the way
    // a recomputed running total does.
    stock_after: {
      type: Number,
      default: null,
    },
  },
  { timestamps: true }
);

TransactionSchema.index({ item_id: 1, createdAt: -1 });

module.exports = mongoose.model("Transaction", TransactionSchema);
