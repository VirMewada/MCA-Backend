const mongoose = require("mongoose");
const TxQuery = require("../txQuery");

const structure = {
  gig: {
    ref: "Gig",
    type: mongoose.Schema.Types.ObjectId,
    required: true, // Assuming gig is required
  },
  // title: {
  //   type: String,
  //   default: "default", // Default title
  // },
  // type: {
  //   type: String,
  //   default: "default", // Default type
  // },
  // subType: {
  //   type: String,
  //   default: "default", // Default subType
  // },
  payment: {
    type: Number,
    // default: 0, // Default payment is 0
  },
  paymentOffered: {
    type: Boolean,
    // default: false, // Default is no payment offered
  },
  description: {
    type: String,
    // default: "default", // Default description
  },
  extraInformation: {
    type: String,
    // default: "default", // Default extra info
  },
  ageRange: {
    type: String,
    // default: "default", // Default age range
  },
  // auditionType: {
  //   type: String,
  //   enum: ["online", "inPerson"],
  //   default: "default", // Default audition type
  // },
  address: {
    location: {
      type: String,
      // default: "default", // Default location
    },
    date: {
      type: String,
      // default: "default", // Default date
    },
    time: {
      type: String,
      // default: "default", // Default time
    },
  },
  ethnicity: String,
  gender: [String],
  noOfApplicants: {
    type: Number,
    default: 0, // Default applicants count is 0
  },
  //--------------------------------
  amount: String,
  duration: String,
  isPaid: Boolean,
  languages: [{ name: String, proficiency: Number }],
  maxAge: Number,
  minAge: Number,
  paymentDescription: String,
  question: String,
  rateType: String,
  requiresNudity: String,
  roleDescription: String,
  skills: [{ name: String, proficiency: Number }],
  subType: String,
  title: String,
  type: String,
  isLive: {
    type: Boolean,
    default: true,
  },
};

const schema = new mongoose.Schema(structure);
const model = mongoose.model("Role", schema);
TxQuery.model("Role", model, structure);
module.exports = model;
