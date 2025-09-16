const mongoose = require("mongoose");
const TxQuery = require("../txQuery");

const structure = {
    order: String,
    status: { type: String, default: 'pending' },
    reason: String,
    product: {type: mongoose.Schema.Types.ObjectId, ref:'Product'},
    user: {type: mongoose.Schema.Types.ObjectId, ref:'User'},
    bnpl: Boolean,
    createdAt: Number,
}

const schema = new mongoose.Schema(structure);
const model = mongoose.model("Order", schema);
TxQuery.model("Order", model, structure);

module.exports = model;