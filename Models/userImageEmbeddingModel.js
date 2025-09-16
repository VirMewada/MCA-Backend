var mongoose = require("mongoose");
var Schema = mongoose.Schema;

var UserImageEmbeddingSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
  },
  embedding: {
    type: [Number],
    required: true,
    validate: {
      validator: (v) => Array.isArray(v) && v.length > 0,
      message: "Embedding must be a non-empty array of numbers.",
    },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("userImageEmbedding", UserImageEmbeddingSchema);
