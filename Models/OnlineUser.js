var mongoose = require("mongoose");
var Schema = mongoose.Schema;

var OnlineUserSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
  },
});

module.exports = mongoose.model("OnlineUser", OnlineUserSchema);
