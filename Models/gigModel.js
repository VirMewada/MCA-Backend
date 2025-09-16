const mongoose = require("mongoose");
const TxQuery = require("../txQuery");

const structure = {
  title: {
    type: String,
  },
  description: {
    type: String,
  },
  type: {
    type: String,
  },
  projectDuration: {
    type: String,
  },
  subTypes: {
    type: [String],
  },
  //--------------------------------
  user: {
    ref: "User",
    type: mongoose.Schema.Types.ObjectId,
  },
  collaborators: [
    {
      ref: "User",
      type: mongoose.Schema.Types.ObjectId,
    },
  ],
  roles: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Role",
    },
  ],
  auditionDescription: String,
  auditionType: String,
  companyName: String, //
  companyWebsite: String, //
  datesAndLocationDescription: String,
  expirationData: Date,
  locations: [
    {
      // Fields for specific state/city locations:
      state: {
        type: String,
        required: false, // Not required if 'type' is 'all_country'
      },
      city: {
        type: String,
        required: false, // Not required if 'type' is 'all_country'
      },
      stateCode: {
        type: String,
        required: false, // Not required if 'type' is 'all_country'
      },

      // Fields for the 'All Over India' option:
      country: {
        type: String,
        required: false, // Only used if 'type' is 'all_country'
      },
      displayName: {
        type: String,
        required: false, // Only used if 'type' is 'all_country' (e.g., "All Over India")
      },

      // This is the crucial discriminator field:
      type: {
        type: String,
        enum: ["specific", "all_country"], // Enforce that the type must be one of these values
        required: true, // Every location object must have a type
      },
    },
  ], // jobTitle: String, //
  // phoneNumber: String, //
  projectDescription: String,
  projectTitle: String,
  // selectedOrganisation: String, //
  selectedProjectType: String,
  selectedSubProjectType: String,
  isLive: Boolean,
  isPaid: Boolean,
  locationDetails: String,

  createdAt: {
    type: Date,
    default: Date.now,
  },
};
const schema = new mongoose.Schema(structure);
const model = mongoose.model("Gig", schema);
TxQuery.model("Gig", model, structure);
module.exports = model;
