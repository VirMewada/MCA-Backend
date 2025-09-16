const mongoose = require("mongoose");

const termsandconditionSchema = mongoose.Schema({
  lastUpdated: Date,
  intro: [String],
  data: [
    {
      title: String,
      subData: [
        {
          title: { type: String, default: "" },
          description: [String],
        },
      ],
    },
  ],
});

const TermsandCondition = mongoose.model(
  "TermsandCondition",
  termsandconditionSchema
);

module.exports = TermsandCondition;
