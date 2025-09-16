const mongoose = require("mongoose");
const TxQuery = require("../txQuery");

const structure = {
  user: {type: mongoose.Schema.Types.ObjectId, ref:'User'},
  titles: [String],
  amount: String,
  positive: Boolean,
  createdAt: Number,
}

const schema = new mongoose.Schema(structure);
const model = mongoose.model("Transaction", schema);
TxQuery.model("Transaction", model, structure);

module.exports = model;