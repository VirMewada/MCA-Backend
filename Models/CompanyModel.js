const mongoose = require("mongoose");
const TxQuery = require("../txQuery");

const structure = {
  name: { type: String, required: true },
  drugs: [
    {
      type: String,
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
};

const schema = new mongoose.Schema(structure);
const model = mongoose.model("Company", schema);
TxQuery.model("Company", model, structure);
module.exports = model;
