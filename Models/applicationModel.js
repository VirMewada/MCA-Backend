const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const TxQuery = require("../txQuery");

const LinkSchema = new Schema(
  {
    url: {
      type: String,
      required: true,
      trim: true,
      match: [
        /^https?:\/\/(?:www\.)?[\w#:.?+=&%@!\-\/]+$/,
        "Please fill a valid URL",
      ], // Basic URL validation
    },
    type: {
      type: String,
      enum: ["youtube", "normal"], // Restrict to 'youtube' or 'normal'
      required: true,
      default: "normal",
    },
  },
  { _id: false }
); // Set _id to false if you don't need a unique ID for each embedded link

const structure = {
  requester: {
    ref: "User",
    type: mongoose.Schema.Types.ObjectId,
  },
  applicant: {
    ref: "User",
    type: mongoose.Schema.Types.ObjectId,
  },
  status: {
    type: String,
    enum: ["pending", "accepted", "rejected", "starred", "completed"],
    default: "pending",
  },
  role: {
    ref: "Role",
    type: mongoose.Schema.Types.ObjectId,
  },
  gig: {
    ref: "Gig",
    type: mongoose.Schema.Types.ObjectId,
  },
  applicationDate: {
    type: Date,
    default: Date.now,
  },
  additionalAnswer: String,
  applicationLinks: {
    type: [LinkSchema], // This defines an array of LinkSchema objects
    default: [], // Default to an empty array
  },
  chatRoomId: String,
};
const schema = new mongoose.Schema(structure);
const model = mongoose.model("Application", schema);
TxQuery.model("Application", model, structure);
module.exports = model;
