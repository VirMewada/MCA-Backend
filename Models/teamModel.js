const mongoose = require("mongoose");
const TxQuery = require("../txQuery");

const teamMemberSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  status: {
    type: String,
    enum: ["invited", "accepted", "rejected"],
    default: "invited",
  },
  teamMemberEmail: String,
  invitedAt: {
    type: Date,
    default: Date.now,
  },
});

const structure = {
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  members: [teamMemberSchema], // array of users with statuses
  createdAt: {
    type: Date,
    default: Date.now,
  },
};

const schema = new mongoose.Schema(structure);
const model = mongoose.model("Team", schema);
TxQuery.model("Team", model, structure);
module.exports = model;
