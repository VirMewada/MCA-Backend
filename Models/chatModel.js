const mongoose = require("mongoose");
const { generateSignedUrl } = require("../Utils/wasabiHelper");

const RoleAttributesSchema = new mongoose.Schema({
  projectName: { type: String, default: null }, // Name of the project
  roleName: { type: String, default: null }, // Name of the role in the chat
  type: { type: String, default: null }, // e.g., "actor", "caster"
  maxAge: { type: Number, default: null }, // e.g., "18-25"
  minAge: { type: Number, default: null }, // e.g., "18-25"
  gender: { type: [String], default: null }, // e.g., "male", "female", "other"
});

// caster: actor -> actor: actor || caster: caster2 -> caster2: caster2 || caster:actor -> caster + actor : actor ||
// caster -> caster +  caster : select photo and name
// applicant -> last message ||

const ChatSchema = new mongoose.Schema(
  {
    participants: [
      // { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      {
        name: { type: String, required: true },
        profilePictureUrl: {
          type: String,
          default:
            "https://icon-library.com/images/default-profile-icon/default-profile-icon-6.jpg",
        },
        type: { type: String, required: true }, // e.g., "actor", "caster"
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
      },
    ],
    seenBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // Users who have seen the message
    groupName: { type: String, default: null }, // Only relevant for group chats
    groupImage: {
      type: String,
      default:
        "https://icon-library.com/images/default-profile-icon/default-profile-icon-6.jpg",
    },
    isGroupChat: { type: Boolean, default: false },
    isApplicationChat: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Who created the chat
    roleAttributes: {
      type: RoleAttributesSchema,
      default: () => ({}), // Ensures defaults apply even if not provided
    },
    lastMessage: {
      text: { type: String, default: null }, // The last message sent in the chat
      dateTime: { type: Date, default: null }, // Date and time of the last message
      senderName: { type: String, default: null }, // Name of the sender of the last message
      senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      }, // ID of the sender of the last message
      roleId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Role",
        default: null,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    roleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Role",
      default: null,
    },
  },
  { timestamps: true }
);

ChatSchema.virtual("participantsWithImageUrl").get(function () {
  return this.participants.map((participant) => {
    const key = participant.profilePictureUrl;

    const url = !key || key.startsWith("http") ? key : generateSignedUrl(key);

    return {
      ...(participant.toObject?.() || participant), // if it's a subdoc, call toObject
      profileImageUrl: url,
    };
  });
});

ChatSchema.set("toJSON", { virtuals: true });
ChatSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Chat", ChatSchema);
