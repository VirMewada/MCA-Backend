const Chat = require("../Models/chatModel.js");
const Message = require("../Models/messageModel.js");
const User = require("../Models/userModel.js");
const mongoose = require("mongoose");
const { io } = require("../Utils/sockets");
const { generateSignedUrl } = require("../Utils/wasabiHelper.js");

exports.createChat = async (req, res) => {
  try {
    let {
      participants,
      groupName,
      groupImage,
      isGroupChat,
      roleAttributes,
      lastMessage,
      isActive,
      roleId,
      isApplicationChat = false,
    } = req.body;

    // Extract userIds from participants
    const participantUserIds = participants.map((p) => p.userId.toString());

    // Check if a chat exists with the same participants AND the same role and project
    let chat = await Chat.findOne({
      "participants.userId": { $all: participantUserIds },
      "roleAttributes.projectName": roleAttributes?.projectName,
      "roleAttributes.roleName": roleAttributes?.roleName,
      isGroupChat: !!isGroupChat, // Ensure group chats are separate
    });

    if (chat) {
      return res.status(200).json({
        success: true,
        message: "chatId",
        chatId: chat._id.toString(), // Return existing chat ID
        projectName: roleAttributes?.projectName, // Maintain response structure
        data: chat,
      });
    }

    // If no chat exists, create a new chat
    const newChatData = {
      participants: participants,
      isGroupChat: !!isGroupChat,
      roleAttributes: roleAttributes, // Include role attributes
      isActive: isActive,
      roleId: roleId,
      isApplicationChat: isApplicationChat,
    };

    chat = new Chat(newChatData);
    await chat.save();
    const chatId = chat._id.toString(); // Store the actual MongoDB ObjectId as a string

    let message;

    if (lastMessage) {
      // Create and store the message
      message = await Message.create({
        chatId: chat._id, // Store actual ObjectId
        senderId: lastMessage.senderId,
        message: lastMessage.text,
      });
    }
    res.status(200).json({
      success: true,
      message: "chatId",
      chatId: chatId,
      projectName: roleAttributes?.projectName,
      data: chat,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

//from explore cards
exports.createChatGeneral = async (req, res) => {
  try {
    let { participants, isGroupChat, lastMessage, isActive } = req.body;

    // Extract userIds from participants
    const participantUserIds = participants.map((p) => p.userId.toString());

    // Check if a chat exists with the same participants AND the same role and project
    let chat = await Chat.findOne({
      "participants.userId": { $all: participantUserIds },
      isGroupChat: !!isGroupChat, // Ensure group chats are separate
    });

    if (chat) {
      return res.status(200).json({
        success: true,
        message: "chatId",
        chatId: chat._id.toString(), // Return existing chat ID
      });
    }

    // If no chat exists, create a new chat
    const newChatData = {
      participants: participants,
      isGroupChat: !!isGroupChat,
      isActive: isActive,
    };

    chat = new Chat(newChatData);
    await chat.save();
    const chatId = chat._id.toString(); // Store the actual MongoDB ObjectId as a string

    let message;

    if (lastMessage) {
      // Create and store the message
      message = await Message.create({
        chatId: chat._id, // Store actual ObjectId
        senderId: lastMessage.senderId,
        message: lastMessage.text,
      });
    }

    res.status(200).json({
      success: true,
      message: "chatId",
      chatId: chatId,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Send message to a chat. If a chat doesn't exist, create a new chat and then send a message
exports.sendMessage = async (req, res = null) => {
  // Default res to null for WebSocket calls

  try {
    let { chatId, senderId, senderName, text } = req.body;
    senderId = new mongoose.Types.ObjectId(senderId);
    let chat;

    if (chatId) {
      // If chatId is provided, fetch the chat
      chat = await Chat.findById(chatId).populate("participants");
    }

    if (!chat) {
      // If no chat exists, create a new chat with the sender as the first participant
      // Include group chat properties if it's a group chat
      const newChatData = {
        participants: [senderId],
      };

      newChatData.groupName = groupName || "New Group"; // Provide a default group name
      newChatData.roleName = roleName || "Member"; // Provide a default role name
      newChatData.roleAttributes = roleAttributes || {
        type: "default",
        ageRange: "N/A",
        gender: "N/A",
        profilePictureUrl: "default_url",
      }; // Provide default role attributes

      chat = new Chat(newChatData);
      await chat.save();
      chatId = chat._id.toString(); // Store the actual MongoDB ObjectId as a string
    } else {
      chatId = chat._id.toString(); // Ensure we use the actual chatId from DB
    }
    // Ensure sender is in chat participants
    // if (!chat.participants.some((user) => user.equals(senderId))) {
    //   chat.participants.push(senderId);
    //   await chat.save();
    // }

    // Create and store the message
    const message = await Message.create({
      chatId: chat._id, // Store actual ObjectId
      senderId,
      senderName,
      message: text,
    });

    // Update last message and timestamp in Chat
    chat.lastMessage = {
      text,
      dateTime: new Date(),
      senderName,
      senderId,
    };
    await chat.save();

    // Determine receivers (all except the sender)
    const receivers = chat.participants.filter(
      (user) => !user.equals(senderId)
    );

    // Emit real-time update via Socket.io
    // if (io) {
    //   io.to(chatId).emit("newMessage", message);
    // } else {
    // }

    // Send push notifications to receivers
    // for (const receiverId of receivers) {
    //   const receiver = await User.findById(receiverId);
    //   if (receiver?.fcmToken) {
    //     sendPushNotification(receiver.fcmToken, text);
    //   }
    // }

    // Handle Socket.io if available
    if (global.io) {
      global.io.to(chatId).emit("newMessage", message);
    }

    // res.status(201).json({ success: true, message, chatId });
    if (res) {
      // If res exists (HTTP request), send JSON response
      return res.status(201).json({ success: true, message, chatId });
    }

    return { success: true, message, chatId }; // For WebSocket response
  } catch (error) {
    console.error("Error:", error);
    // res.status(500).json({ success: false, error: error.message });
    if (res) {
      return res.status(500).json({ success: false, error: error.message });
    }

    return { success: false, error: error.message }; // Return error for WebSocket calls
  }
};

exports.addParticipant = async (req, res) => {
  try {
    const { newUser, groupName } = req.body;

    const chat = await Chat.findById(req.params.chatId);
    if (!chat) {
      return res.status(404).json({ success: false, error: "Chat not found" });
    }

    // Conditionally update group name
    if (groupName) {
      chat.groupName = groupName;
    }

    if (newUser) {
      // Check if user is already in the chat based on `_id`
      const isUserInChat = chat.participants.some(
        (participant) =>
          participant._id.toString() === newUser?.userId?.toString()
      );

      if (isUserInChat) {
        return res
          .status(400)
          .json({ success: false, error: "User already in chat" });
      }
      // Add new user to participants array
      chat.participants.push(newUser);
    }

    // Convert to group if there are more than 2 users
    chat.isGroupChat = chat.participants.length > 2;
    await chat.save();
    res.status(200).json({ success: true, chat });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get Chat assiciated with a chat Id
exports.getChat = async (req, res) => {
  try {
    const { chatId } = req.params;

    // Validate chatId
    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ success: false, error: "Invalid chat ID" });
    }

    // Check if chat exists
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ success: false, error: "Chat not found" });
    }

    // Fetch messages associated with the chatId
    // const messages = await Message.find({ chatId }).sort("createdAt");

    res.status(200).json({ success: true, chat });
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get all chats associated with a user
exports.getUserChats = async (req, res) => {
  try {
    const { userId } = req.params;

    // console.log("User ID:", req.params, " ", userId);

    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, error: "Invalid user ID" });
    }

    const chats = await Chat.find({
      "participants.userId": new mongoose.Types.ObjectId(userId),
    })
      .populate("participants.userId", "_id username") // Populate user details
      .sort({ updatedAt: -1 });
    // console.log("   User chats:", chats);

    if (chats.length === 0) {
      return res.status(404).json({ success: false, error: "No chats found" });
    }
    // console.log("User ID: ", userId, "   User chats:", chats);
    const enrichedChatss = chats.map((chat) => {
      const chatObj = chat.toObject();

      chatObj.participants = chat.participants.map((participant) => {
        const key = participant.profilePictureUrl;
        return {
          ...participant,
          profileImageUrl:
            !key || key.startsWith("http") ? key : generateSignedUrl(key),
        };
      });

      return chatObj;
    });

    console.log("Enriched Chats:", enrichedChatss[0].participants);

    // res.status(200).json({ success: true, chats });
    // res.status(200).json({ success: true, chats: enrichedChats });

    const enrichedChats = chats.map((chat) => chat.toJSON());
    res.status(200).json({ success: true, chats: enrichedChats });
  } catch (error) {
    console.error("Error fetching user chats:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get all chats associated with a user
// exports.updateUserChats = async (req, res) => {
//   try {
//     const { chatId } = req.params; // Get chat ID from URL
//     const updatedChatData = req.body; // Get updated chat data from request body

//     // Validate chat ID
//     if (!mongoose.Types.ObjectId.isValid(chatId)) {
//       return res.status(400).json({ success: false, error: "Invalid chat ID" });
//     }

//     // Find and update the chat
//     const updatedChat = await Chat.findByIdAndUpdate(
//       chatId,
//       { $set: updatedChatData }, // Update the chat with new data
//       { new: true } // Return the updated document
//     );

//     if (!updatedChat) {
//       return res.status(404).json({ success: false, error: "Chat not found" });
//     }

//     res.status(200).json({ success: true, chat: updatedChat });
//   } catch (error) {
//     console.error("Error updating chat:", error);
//     res.status(500).json({ success: false, error: error.message });
//   }
// };

exports.updateUserChats = async (req, res) => {
  try {
    const { chatId } = req.params; // Get chat ID from URL
    const updatedFields = req.body; // Get all updated chat data from request body

    // 1. Validate chat ID
    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ success: false, error: "Invalid chat ID" });
    }

    // 2. Construct the MongoDB update object dynamically
    const mongoUpdateOperations = {};
    let hasValidUpdate = false; // Flag to check if any valid updates were processed

    console.log("seen by entered");

    for (const key in updatedFields) {
      if (updatedFields.hasOwnProperty(key)) {
        // Prevent trying to update the _id field
        console.log("seen by id: ", key, "--", updatedFields);
        // if (key === "userId") {
        //   continue;
        // }

        // Special handling for the 'seenBy' array
        if (key === "seenBy") {
          console.log("seen by");

          const newSeenByUsers = updatedFields[key];
          // if (Array.isArray(newSeenByUsers) && newSeenByUsers.length > 0) {
          console.log("Adding seenBy users:", newSeenByUsers);

          // Use $addToSet with $each to add multiple unique elements atomically
          // This ensures robustness against race conditions and avoids duplicates
          mongoUpdateOperations.$addToSet = {
            seenBy: newSeenByUsers,
          };
          hasValidUpdate = true;
          // } else if (newSeenByUsers === null || newSeenByUsers === undefined) {
          //   console.log("seenBy is null or undefined, skipping update.");

          //   // If seenBy is explicitly sent as null/undefined/empty array, decide how to handle it.
          //   // For robustness, if it's empty, we just won't add anything new.
          //   // If you ever want to clear the seenBy array, you'd need a separate logic or specific flag.
          // }
        } else {
          // For all other fields, use the $set operator to update their values
          if (!mongoUpdateOperations.$set) {
            mongoUpdateOperations.$set = {};
          }
          mongoUpdateOperations.$set[key] = updatedFields[key];
          hasValidUpdate = true;
        }
      }
    }

    // If no valid update operations were constructed from the request body
    if (!hasValidUpdate) {
      return res.status(400).json({
        success: false,
        error: "No valid fields provided for update.",
      });
    }

    // 3. Find and update the chat document
    const updatedChat = await Chat.findByIdAndUpdate(
      chatId,
      mongoUpdateOperations, // Use the dynamically constructed update object
      {
        new: true, // Return the updated document
        // runValidators: true, // Optional: Run Mongoose schema validators on the update
        // upsert: false // Optional: Do not create a new document if not found
      }
    );

    if (!updatedChat) {
      return res.status(404).json({ success: false, error: "Chat not found" });
    }

    res.status(200).json({ success: true, chat: updatedChat });
  } catch (error) {
    console.error("Error updating chat:", error);
    // You might want to use your custom AppError here if it's integrated
    res.status(500).json({ success: false, error: "Internal server error." });
  }
};

// Get messages associated with a chatId
exports.getChatMessages = async (req, res) => {
  try {
    const { chatId } = req.params;

    // Validate chatId
    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ success: false, error: "Invalid chat ID" });
    }

    // Check if chat exists
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ success: false, error: "Chat not found" });
    }

    // Fetch messages associated with the chatId, sorted by creation date
    const messages = await Message.find({ chatId })
      .populate("senderId", "_id name profilePictureUrl") // Populate sender details
      .sort({ createdAt: 1 });

    // console.log("Messages:", messages);

    res.status(200).json({ success: true, messages });
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};
