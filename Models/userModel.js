const mongoose = require("mongoose");
const TxQuery = require("../txQuery");
const bcrypt = require("bcrypt");
const { type } = require("os");
const { generateSignedUrl } = require("../Utils/wasabiHelper");

const structure = {
  firstName: String,
  lastName: String,
  approved: Boolean,
  dateOfBirth: Number,
  email: {
    type: String,
    unique: true,
    required: [true, "must enter email"],
  },
  image: {
    type: String,
    default:
      "https://icon-library.com/images/default-profile-icon/default-profile-icon-6.jpg",
  },
  blocked: { Boolean, default: false },
  password: {
    type: String,
    required: [true, "must enter password"],
    minlength: 8,
    maxlength: 16,
    select: false,
  },
  interests: Array,
  passwordChangedAt: Date,
  accountType: String,
  passwordResetToken: Number,
  passwordResetExpires: Number,
  phone: String,

  bio: { type: String, default: "" },

  //---------------
  active: {
    type: Boolean,
    default: true,
    select: false,
  },
  profileCompleted: {
    type: Boolean,
    default: false,
  },
  interestSelected: {
    type: Boolean,
    default: false,
  },
  // brochure: String,
  isUserDescriptionCompleted: {
    type: Boolean,
    default: false,
  },
  isKYCCompleted: {
    type: Boolean,
    default: false,
  },
  deleted: { type: Boolean, default: false },
  address: {
    type: String,
    default: null,
  },
  state: {
    type: String,
    default: null,
  },
  stateFullName: {
    type: String,
    default: null,
  },
  city: {
    type: String,
    default: null,
  },
  gstNumber: { type: String, default: null },
  role: {
    type: String,
    enum: {
      values: ["retailer", "distributer"],
      message: "Enter valid role ",
    },
    default: "retailer",
  },
  companies: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
    },
  ],
  otp: {
    type: Number,
  },
  otpExpires: Date,
  deviceToken: String,
  member: String,
  companyName: String,
  companyType: String,
  verified: {
    type: String,
    enum: {
      values: ["unverified", "verified", "rejected", "pending"],
    },
    default: "unverified",
  },
  subscriptionId: String,
  isNotification: {
    type: Boolean,
    default: true,
  },
  media: {
    images: [String],
    videos: [String],
  },
  appearance: {
    gender: String,
    height: Number,
    weight: Number,
    hairColor: String,
    language: String,
    ethnicity: String,
    ageMin: Number,
    ageMax: Number,
    bodyType: String,
  },
  social: [
    {
      displayName: String,
      url: String,
      type: String,
    },
  ],
  savedGigs: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Gig",
    },
  ],
  pastProjects: [
    {
      type: mongoose.Schema.Types.Mixed,
    },
  ],
  sceneComfort: [String],
  skills: [String],
  languages: [String],
  fcmToken: { type: String }, // Store FCM token
  isAdmin: { type: Boolean, default: false },
};

const userSchema = new mongoose.Schema(structure, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

userSchema.virtual("profileImageUrl").get(function () {
  // If user.image is a full URL (e.g., default), just return it
  if (!this.image || this.image.startsWith("http")) {
    return this.image;
  }
  // Otherwise, generate a signed URL from the Wasabi key
  return generateSignedUrl(this.image);
});

userSchema.virtual("mediaImageObjects").get(function () {
  if (!this.media || !Array.isArray(this.media.images)) return [];

  return this.media.images.map((key) => {
    if (!key || key.startsWith("http")) {
      return { key, url: key };
    }
    return {
      key,
      url: generateSignedUrl(key),
    };
  });
});

userSchema.pre("save", async function (next) {
  //only run this function if password id actually modified
  if (!this.isModified("password")) return next();
  // Hash the password with cost
  this.password = await bcrypt.hash(this.password, 12);
  // remove(stop) the confirmPassword to store in db. require means necessary to input not to save in db.
  this.confirmPassword = undefined;
  next();
});
// password Tester
userSchema.methods.correctPassword = async function (
  passwordByUser,
  passwordInDb
) {
  return await bcrypt.compare(passwordByUser, passwordInDb);
};

// ========method to protect routes verifies all about token

userSchema.methods.changedPasswordAfter = function (JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(
      this.passwordChangedAt.getTime() / 1000,
      10
    );
    console.log(changedTimestamp, JWTTimestamp);
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

// update "passwordChangedAt value in DB whenever we update password "
userSchema.pre("save", function (next) {
  if (!this.isModified("password") || this.isNew) return next();
  this.passwordChangedAt = Date.now() - 1000; //here -1000 mili seconds is to make sure that it will not creat any problem in login as some times that gets this
  next();
});

// Middleware to only get active=true users
userSchema.pre(/^find/, function (next) {
  // here "this" points to the current property`
  this.find({ active: true });
  next();
});

const model = mongoose.model("User", userSchema);
TxQuery.model("User", model, structure);
module.exports = model;
