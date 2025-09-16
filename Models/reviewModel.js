const mongoose = require("mongoose");
const TxQuery = require("../txQuery");

const structure = {
    reviewer: {type: mongoose.Schema.Types.ObjectId, ref:'User'},
    reviewee: {type: mongoose.Schema.Types.ObjectId, ref:'User'},
    text: String,
    rating: Number,
    points: [String],
    createdAt: Number,
}

const schema = new mongoose.Schema(structure);
const model = mongoose.model("Review", schema);
TxQuery.model("Review", model, structure);

module.exports = model;