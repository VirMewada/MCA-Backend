// var mongoose = require("mongoose");
// var Schema = mongoose.Schema;

// const notificationSchema = new mongoose.Schema(
//   {
//     notifyType: String,
//     // sender: { type: Schema.Types.ObjectId, ref: "User" },
//     receiver: { type: Schema.Types.ObjectId, ref: "User" },
//     seen: { type: Boolean, default: false },
//     title: String,
//     desc: String,
//     time: String,
//     data: Object,
//   },
//   { timestamps: true }
// );

// const Notification = mongoose.model("Notification", notificationSchema);
// module.exports = Notification;

const mongoose = require("mongoose");
const { Schema } = mongoose;

const notificationSchema = new Schema(
  {
    type: {
      type: String,
      enum: [
        "collaboration_invite",
        "application",
        "role",
        "message",
        "generic",
      ],
      required: true,
    },

    // Who triggered this notification
    sender: { type: Schema.Types.ObjectId, ref: "User" },

    // Who is receiving it
    recipient: { type: Schema.Types.ObjectId, ref: "User" },
    recipientEmail: String,

    // Textual fallback (used for quick rendering)
    title: String,
    message: String,

    // Whether user has seen it or not
    seen: { type: Boolean, default: false },

    // Arbitrary context data
    data: Schema.Types.Mixed, // e.g., { gigId, applicationId }

    // Whether it was actionable (e.g., Accept/Reject) and what was done
    action: {
      type: String,
      enum: ["pending", "accepted", "rejected", "viewed", "none"],
      default: "none",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Notification", notificationSchema);
