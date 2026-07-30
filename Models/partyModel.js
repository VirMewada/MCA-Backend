const mongoose = require("mongoose");

/**
 * A party we sell to — the customer side of the ledger.
 *
 * Deliberately kept separate from Vendor rather than adding a "type" field to
 * it: the two carry different data (vendors have lead times and performance
 * scores, parties have credit terms and shipping addresses) and mixing them
 * would mean every vendor query has to remember to filter.
 *
 * NEW collection — nothing existing reads or writes it.
 */
const PartySchema = new mongoose.Schema(
  {
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

    country_code: { type: String, trim: true, default: "91" },
    phone: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, lowercase: true, default: "" },

    gst: { type: String, trim: true, uppercase: true, default: "" },

    // Where the invoice goes
    billing_address: { type: String, trim: true, default: "" },
    // Where the goods go, when it differs
    shipping_address: { type: String, trim: true, default: "" },

    city: { type: String, trim: true, default: "" },
    state: { type: String, trim: true, default: "" },

    payment_terms: { type: String, trim: true, default: "" },

    // Informational only — nothing blocks an order on it today.
    credit_limit: { type: Number, default: 0 },

    note: { type: String, default: "" },

    is_deleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

PartySchema.index({ name: "text", code: "text" });

module.exports = mongoose.model("Party", PartySchema);
