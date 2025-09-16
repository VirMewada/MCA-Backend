const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema(
  {
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      required: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    senderName: { type: String, required: true },
    message: { type: String, required: true },
    seenBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // Users who have seen the message
    type: {
      type: String,
      enum: ["text", "audio", "photo", "video", "alert"],
      default: "text",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Message", MessageSchema);
