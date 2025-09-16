const mongoose = require("mongoose");

const SavedDatabaseSchema = new mongoose.Schema({
  owner: {
    ref: "User",
    type: mongoose.Schema.Types.ObjectId,
  },
  folderName: {
    type: String,
  },
  isCollaboration: { type: Boolean, default: false },
  collaborators: [
    {
      ref: "User",
      type: mongoose.Schema.Types.ObjectId,
    },
  ],
  savedUsers: [
    {
      ref: "User",
      type: mongoose.Schema.Types.ObjectId,
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("SavedDatabase", SavedDatabaseSchema);
