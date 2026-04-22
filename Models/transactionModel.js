const mongoose = require("mongoose");

const TransactionSchema = new mongoose.Schema(
  {
    item_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Item",
      required: true,
    },

    type: {
      type: String,
      enum: ["issue", "receive"],
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
  },
  { timestamps: true }
);

module.exports = mongoose.model("Transaction", TransactionSchema);
