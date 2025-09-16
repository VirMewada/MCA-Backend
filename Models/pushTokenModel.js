const mongoose = require("mongoose");
const { Schema } = mongoose;

const pushTokenSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    expoPushToken: {
      type: String,
      required: true,
      unique: false,
    },
    role: {
      type: String,
      required: true,
    },
    deviceId: { type: String, unique: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PushToken", pushTokenSchema);
