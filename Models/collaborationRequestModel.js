const mongoose = require("mongoose");
const TxQuery = require("../txQuery");

const structure = {
  gigId: {
    ref: "Gig",
    type: mongoose.Schema.Types.ObjectId,
  },
  Owner: {
    ref: "User",
    type: mongoose.Schema.Types.ObjectId,
  },
  collaboratorEmail: String,
  status: {
    type: String,
    enum: ["pending", "accepted", "rejected"],
    default: "pending",
  },
};
const schema = new mongoose.Schema(structure);
const model = mongoose.model("CollaborationRequest", schema);
TxQuery.model("CollaborationRequest", model, structure);
module.exports = model;
