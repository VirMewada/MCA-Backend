const mongoose = require("mongoose");
const { generateSignedUrl } = require("../Utils/wasabiHelper");

const VerificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    galleryImage: {
      type: String,
    },
    cameraImage: {
      type: String,
    },
    verificationStatus: {
      type: String,
      enum: ["unverified", "verified", "rejected", "pending"],
      default: "unverified",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// VerificationSchema.virtual("galleryImageUrl").get(function () {
//   if (!this.galleryImage || this.galleryImage.startsWith("http")) {
//     return this.galleryImage;
//   }
//   return generateSignedUrl(this.galleryImage);
// });

// VerificationSchema.virtual("cameraImageUrl").get(function () {
//   if (!this.cameraImage || this.cameraImage.startsWith("http")) {
//     return this.cameraImage;
//   }
//   return generateSignedUrl(this.cameraImage);
// });

VerificationSchema.virtual("galleryImageUrl").get(function () {
  if (!this.galleryImage) return null;
  return `/api/v1/media/${this.galleryImage}`;
});

// VerificationSchema.virtual("galleryImageUrl").get(function () {
//   if (!this.galleryImage) return null;
//   return `/api/v1/media/${encodeURIComponent(this.galleryImage)}`;
// });

VerificationSchema.virtual("cameraImageUrl").get(function () {
  if (!this.cameraImage) return null;
  return `/api/v1/media/${this.cameraImage}`;
});

module.exports = mongoose.model("Verification", VerificationSchema);
