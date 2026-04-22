const mongoose = require("mongoose");

const PartSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    code: {
      type: String,
      trim: true,
      default: "",
    },

    qty: {
      type: Number,
      required: true,
      default: 1,
    },

    weight: {
      type: Number,
      required: true,
    },

    rate: {
      type: Number,
      required: true,
    },

    labour: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

/* Raw Material Cost */
PartSchema.virtual("rawMat").get(function () {
  return this.weight * this.rate;
});

/* Total Cost */
PartSchema.virtual("total").get(function () {
  const rawMat = this.weight * this.rate;
  return (rawMat + this.labour) * this.qty;
});

PartSchema.set("toJSON", { virtuals: true });
PartSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Part", PartSchema);
