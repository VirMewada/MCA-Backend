const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const refreshTokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    deviceToken: String,
    token: String,
    device: String,

    // --- New Session Tracking Fields ---
    sessionStartAt: {
      // When the user's continuous session on this device began
      type: Date,
      default: Date.now,
      required: true,
    },
    lastActivityAt: {
      // When this specific refresh token was last used/issued
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

refreshTokenSchema.pre("save", async function (next) {
  //only run this function if password id actually modified
  if (!this.isModified("token")) return next();
  // Hash the password with cost
  this.token = await bcrypt.hash(this.token, 12);
  next();
});

// Method to compare candidate plain-text token with hashed token in DB
refreshTokenSchema.methods.correctToken = async function (
  candidateToken,
  userToken
) {
  console.log("Calling correctToken:");
  console.log("  Candidate (plain):", candidateToken);
  console.log("  UserToken (from DB - should be hashed):", userToken);
  const match = await bcrypt.compare(candidateToken, userToken);
  console.log("  Bcrypt comparison result:", match);
  return match;
};

const RefreshToken = mongoose.model("RefreshToken", refreshTokenSchema);
module.exports = RefreshToken;
