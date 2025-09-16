const mongoose = require("mongoose");
const TxQuery = require("../txQuery");

const structure = {
  name: { type: String, required: true },
  createdAt: {
    type: Date,
    default: Date.now,
  },
};

const schema = new mongoose.Schema(structure);
const model = mongoose.model("Drug", schema);
TxQuery.model("Drug", model, structure);
module.exports = model;
