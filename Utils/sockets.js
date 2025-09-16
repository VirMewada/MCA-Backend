// const Message = require("../Models/messageModel.js");
const Chat = require("../Models/chatModel");
// const moment = require("moment");
// const redis = require("redis");
// const Notification = require("../Models/NotificationModel.js");
// const RefreshToken = require("../Models/refreshTokenModel");
// const User = require("../Models/userModel");
// const {
//   SendNotification,
//   SendNotificationMultiCast,
// } = require("../Utils/notification");

// const { sendNotification } = require("../Utils/notification");

// const OnlineUser = require("../Models/OnlineUser");
// const { json } = require("body-parser");
// const { JsonWebTokenError } = require("jsonwebtoken");
// const io = require("socket.io")();

const socketIo = require("socket.io");
const messageController = require("../Controllers/messageController.js");
const handleCollaborationInvite = require("../services/notificationhandlers/handleCollaborationInvite.js");
const pushToken = require("../Models/pushTokenModel.js");
const fetch = require("node-fetch");

const socketapi = {
  io: null,

  setup: (server) => {
    socketapi.io = socketIo(server, {
      cors: { origin: "*", methods: ["GET", "POST"], credentials: true },
      transports: ["websocket"], // Force WebSocket only (remove polling)
    });

    let chatUsers = new Map(); // Track users in chat (Map for O(1) lookup)
    let notificationUsers = new Set(); // Track users in notification namespace

    // Main Chat Namespace
    const chatNamespace = socketapi.io.of("/chat");
    chatNamespace.on("connection", (socket) => {
      socket.on("joinChat", async ({ chatId, userId }) => {
        socket.userId = userId;
        socket.chatId = chatId;

        // Store userId in chatUsers
        if (!chatUsers.has(userId)) {
          chatUsers.set(userId, new Set());
        }
        chatUsers.get(userId).add(socket.id);

        try {
          let chatRoom = await Chat.findById(chatId);
          if (!chatRoom) {
            chatRoom = new Chat({ _id: chatId, users: [] });
            await chatRoom.save();
          }

          socket.join(chatId);
          console.log(`📩 User ${userId} joined chat ${chatId}`);
        } catch (error) {
          console.error("⚠️ Error joining chat:", error);
        }
      });

      // Send message
      socket.on("sendMessage", async (data) => {
        try {
          const response = await messageController.sendMessage({ body: data });

          chatNamespace.to(data.chatId).emit("newMessage", response);

          let chatRoom = await Chat.findById(data.chatId);
          console.log("chatroom", chatRoom);

          if (chatRoom) {
            let allChatUsers = chatRoom.participants.map((p) =>
              p.userId.toString()
            );

            let usersToNotify = allChatUsers.filter(
              (userId) => !chatUsers.has(userId)
              //&& notificationUsers.has(userId)
            );

            console.log("Users to notify:", usersToNotify);

            for (const userId of usersToNotify) {
              try {
                const tokenDoc = await pushToken.findOne({ userId: userId }); // Use the current userId from the loop
                if (tokenDoc?.expoPushToken) {
                  const message = {
                    to: tokenDoc.expoPushToken,
                    sound: "default",
                    title: "New Message!",
                    body: "You have a new message waiting!",
                    data: {},
                  };

                  await fetch("https://exp.host/--/api/v2/push/send", {
                    method: "POST",
                    headers: {
                      Accept: "application/json",
                      "Accept-Encoding": "gzip, deflate",
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify(message),
                  });
                  console.log(`Notification sent to user: ${userId}`);
                } else {
                  console.log(`No Expo Push Token found for user: ${userId}`);
                }
              } catch (error) {
                console.error(
                  `Error sending notification to user ${userId}:`,
                  error
                );
              }
            }

            usersToNotify.forEach((userId) => {
              socketapi.io
                .of("/notifications")
                .to(userId)
                .emit("newMessageNotification", {
                  chatId: data.chatId,
                  message: response,
                });
            });
          }
        } catch (error) {
          console.error("⚠️ Error sending message:", error);
        }
      });

      socket.on("disconnect", () => {
        if (socket.userId) {
          let sockets = chatUsers.get(socket.userId);
          if (sockets) {
            sockets.delete(socket.id);
            if (sockets.size === 0) {
              chatUsers.delete(socket.userId);
            }
          }
          console.log(`❌ User ${socket.userId} left chat.`);
        }
      });
    });

    // Notification Namespace
    const notificationNamespace = socketapi.io.of("/notifications");
    notificationNamespace.on("connection", (socket) => {
      socket.on("registerNotifications", ({ userId }) => {
        socket.userId = userId;
        socket.join(userId);
        notificationUsers.add(userId);
        console.log(`✅ User ${userId} registered for notifications`);
      });

      // 🔥 New event for socket-based collaboration invite
      socket.on("collaboration_invite", async (data, callback) => {
        try {
          const fakeReq = {
            body: data,
            user: { _id: data.senderId }, // If your API uses `req.user._id`, mock it
          };

          const result = await handleCollaborationInvite(fakeReq);

          if (result?.data?.notification?.recipient) {
            const recipientId = result.data.notification.recipient.toString();

            // Optionally emit to recipient if connected
            notificationNamespace
              .to(recipientId) // 👈 Emit to userId room
              .emit("newNotification", result);
          }

          // Let frontend know it worked (via callback or acknowledgment)
          if (callback) callback({ success: true, message: result.message });
        } catch (err) {
          console.error("⚠️ Error in collaboration_invite via socket:", err);
          if (callback)
            callback({ success: false, message: "Failed to send invite" });
        }
      });

      socket.on("disconnect", () => {
        if (socket.userId) {
          notificationUsers.delete(socket.userId);
        }
        console.log("❌ User disconnected from /notifications:", socket.id);
      });
    });
  },
};

// const client = redis.createClient()
// const client = {
//   set: async (user) =>
//     await OnlineUser.updateOne({ user }, {}, { upsert: true }),
//   del: async (user) => await OnlineUser.deleteOne({ user }),
//   flushDb: async () => await OnlineUser.deleteOne({}),
//   KEYS: async () => {
//     const keys = await OnlineUser.find({});
//     const newKeys = [];
//     for (const key of keys) newKeys.push(`${key.user}`);
//     return newKeys;
//   },
//   connect: async () => null,
// };

// ///////// User Promises
// const userData = {};
// const userSocketID = {};

// setInterval(async () => {
//   try {
//     const promises = [];

//     for (const userId in userData)
//       if (userData[userId]) promises.push(userData[userId]());
//     await Promise.all(promises);
//   } catch (e) {
//     console.log(e);
//   }
// }, 5 * 1000);
// ///////////////////////////

// client.connect().then(async (_) => {
//   await client.flushDb();

//   const getOnlineUsers = async () => {
//     const userIds = await client.KEYS();
//     const users = await User.find({ _id: { $in: userIds } }).select("id");
//     io.emit("online-users", {
//       message: "Online Users Retrieved Successfully",
//       success: true,
//       data: { users },
//     });
//   };

//   io.sockets.on("connect", async (socket) => {
//     console.log(`Connected to ${socket.id}`);
//     /// authenticate user
//     const authenticated = (cb) => async (data) => {
//       const user = await User.findOne({ _id: data.userId });
//       //   console.log("****************" + data.userId);
//       //   console.log(user);

//       if (!user) {
//         socket.emit({ message: "Unauthenticated", success: false, data: {} });
//         return socket.disconnect();
//       }
//       await cb({ user: JSON.parse(JSON.stringify(user)), ...data });
//     };
//     //// user enter
//     socket.on(
//       "user-enter",
//       authenticated(async ({ user }) => {
//         console.log(`User enter Connected to ${socket.id}`);
//         //////////// user info SUBSCRIBE
//         const f = async () => {
//           try {
//             ///////// notifications
//             const notifictations = await Notification.find({
//               $or: [
//                 {
//                   $and: [
//                     { notifyType: { $ne: "sendMessage" } },
//                     { receiver: user._id },
//                     { actionTaken: false },
//                   ],
//                 },
//                 {
//                   $and: [
//                     { notifyType: { $ne: "sendMessage" } },
//                     { multireceiver: { $in: [user._id] } },
//                     { isSeen: { $not: { $elemMatch: { $eq: user._id } } } },
//                   ],
//                 },
//               ],
//             });
//             // console.log(notifictations.length, notifictations.length, user);

//             const sizenotif = notifictations.length;
//             let action;
//             sizenotif > 0 ? (action = false) : (action = true);
//             ///////////////////////////////////
//             ///////// Chat Count
//             let messagescount = 0;
//             let ChatRooms;
//             ChatRooms = await Chat.find({ users: { $in: [user._id] } }).sort(
//               "-updatedAt"
//             );

//             ChatRooms = JSON.parse(JSON.stringify(ChatRooms));

//             for (let i = 0; i < ChatRooms.length; i++) {
//               const dbMessages = await Message.find({
//                 $and: [
//                   { chatId: ChatRooms[i]._id },
//                   { seen: false },
//                   { receiver: { $eq: user._id } },
//                 ],
//               });

//               ChatRooms[i].newMessages = dbMessages.length;
//               messagescount = messagescount + dbMessages.length;
//             }
//             ////////////////////////////////////////
//             // socket.emit('info', {...sendingData})
//             socket.join(user._id);
//             io.to(user._id).emit("notification", {
//               success: true,
//               message: "Notification Retrieved Successfully",
//               data: { action: action, messages: messagescount },
//             });
//           } catch (e) {
//             console.log(e);
//           }
//         };
//         await f();
//         userData[`${user._id}`] = f;
//         userSocketID[`${socket.id}`] = user._id;

//         //////////// user info SUBSCRIBE-end
//         console.log(user, user._id);
//         socket.join(user._id);
//         await client.set(user._id);
//         await getOnlineUsers();
//       })
//     );
//     //// user leave
//     socket.on(
//       "user-leave",
//       authenticated(async ({ user }) => {
//         // user info sub leave
//         delete userData[`${user._id}`];
//         /// user info sub leave
//         await client.del(user._id);
//         await getOnlineUsers();
//         socket.leave(user._id);
//         io.to(user._id).emit("leaving", {
//           success: true,
//           message: "Socket left",
//         });
//       })
//     );
//     // get online users
//     socket.on(
//       "get-online-users",
//       authenticated(async () => {
//         await getOnlineUsers();
//       })
//     );

//     socket.on(
//       "get-inboxes",
//       authenticated(async ({ user }) => {
//         /////////////////// Chat Room Find
//         console.log(`Get Inboxes Connected to ${socket.id}`);
//         let ChatRooms;
//         ChatRooms = await Chat.find({ users: { $in: [user._id] } }).sort(
//           "-updatedAt"
//         );

//         ChatRooms = JSON.parse(JSON.stringify(ChatRooms));

//         for (let i = 0; i < ChatRooms.length; i++) {
//           const dbMessages = await Message.find({
//             $and: [
//               { chatId: ChatRooms[i]._id },
//               { seen: false },
//               { receiver: { $eq: user._id } },
//             ],
//           });

//           ChatRooms[i].newMessages = dbMessages.length;
//         }

//         console.log("Rooms ==>", ChatRooms);

//         if (ChatRooms.length < 1) {
//           ChatRooms = null;
//           io.to(user._id).emit("inboxes", {
//             success: true,
//             message: "Inbox Retrieved Succcessfully",
//             // data: { inboxes: [...inboxes], },
//             inboxes: [],
//           });
//         } else {
//           // socket.join(user._id);
//           io.to(user._id).emit("inboxes", {
//             success: true,
//             message: "Inbox Retrieved Succcessfully",
//             // data: { inboxes: [...inboxes], },
//             inboxes: [...ChatRooms],
//           });
//         }
//       })
//     );

//     socket.on(
//       "join-room",
//       authenticated(async ({ user, inbox }) => {
//         console.log("SELFID--->> ", user._id, "NEXTUSERID---->", inbox);
//         let ChatRoom;
//         ///////////// Receiver
//         const receiveruser = await User.findById(inbox);
//         //////////////
//         //////////// Chat Room Find
//         ChatRoom = await Chat.findOne({
//           $and: [{ users: user._id }, { users: inbox }],
//         });
//         ////////////////////////
//         const updatedMessages = await Message.updateMany(
//           { sender: inbox, receiver: user._id },
//           { seen: true }
//         );
//         console.log("updated msgs", updatedMessages);
//         let messages;
//         messages = await Message.find({
//           $and: [
//             {
//               $or: [{ sender: user._id }, { receiver: user._id }],
//             },
//             {
//               $or: [{ sender: inbox }, { receiver: inbox }],
//             },
//           ],
//         })
//           .populate("sender")
//           .populate("receiver")
//           .sort({ createdAt: -1 });

//         //////////// MSGS Filtering
//         messages = JSON.parse(JSON.stringify(messages));
//         for (let i = 0; i < messages.length; i++) {
//           if (messages[i].seen === false) {
//             console.log("Test 1");
//             if (messages[i].sender._id === user._id) {
//               console.log("Test 2");
//               messages[i].seen = true;
//             }
//           }
//         }
//         // .populate("receiver")
//         // .populate("sender");
//         const chatId = ChatRoom._id.toString();
//         // socket.join(user._id);
//         console.log("Room id:", chatId);
//         socket.join(chatId);
//         io.to(user._id).emit("messages", {
//           success: true,
//           message: "Messages Retrieved Successfully",
//           receiver: receiveruser,
//           messages: [...messages],
//         });
//       })
//     );
//     socket.on(
//       "leave-room",
//       authenticated(async ({ user, inbox }) => {
//         console.log("SELFID--->> ", user._id, "NEXTUSERID---->", inbox);
//         let ChatRoom;
//         //////////// Chat Room Find
//         ChatRoom = await Chat.findOne({
//           $and: [{ users: user._id }, { users: inbox }],
//         });
//         ////////////////////////

//         const chatId = ChatRoom._id.toString();
//         console.log("Room id:", chatId);
//         socket.leave(chatId);
//         io.to(user._id).emit("leaving", {
//           success: true,
//           message: "Room left",
//         });
//       })
//     );
//     socket.on(
//       "send-message",
//       authenticated(async ({ user, to, message, messageType }) => {
//         try {
//           ///////////time
//           // Get current date in UTC
//           // Get current local time
//           const currentLocalTime = moment();

//           ///////////// Receiver
//           const receiveruser = await User.findById(to);
//           //////////////

//           // Convert local time to UTC
//           // const currentUtcTime = currentLocalTime.utc().utcOffset(1);

//           // Convert UTC time to Unix timestamp
//           const currentUnixTime = currentLocalTime.unix();

//           console.log("Current Local Time:", currentLocalTime);
//           // console.log("Current UTC Time:", currentUtcTime);
//           console.log("Current Unix Timestamp:", currentUnixTime);
//           ///////// time

//           console.log("innnnn send msg start Startttttttttt");
//           const receiver = await User.findOne({ _id: to });

//           ///////////////// Room update
//           let chat;

//           chat = await Chat.findOne({
//             $and: [{ users: user._id }, { users: to }],
//           });
//           const userr1 = to;
//           const user2 = user._id;
//           if (!chat) {
//             const users = [userr1, user2];
//             console.log(users);
//             chat = await Chat.create({
//               users: users,
//               lastMsgSender: user2,
//               LastMessage: message,
//               messageTime: currentUnixTime,
//               type: messageType,
//             });
//           } else {
//             await Chat.findByIdAndUpdate(chat.id, {
//               lastMsgSender: user2,
//               LastMessage: message,
//               messageTime: currentUnixTime,
//               type: messageType,
//             });
//           }
//           ///////////////// Room Login
//           const chatId = chat._id.toString();
//           console.log("Room id in send:", chatId);
//           // socket.join(chatId);
//           const joinedPeople = io.sockets.adapter.rooms.get(chatId);
//           console.log("Room People:", joinedPeople);
//           const joinedPeopleCount = joinedPeople ? joinedPeople.size : 0;

//           //////////////////////

//           ///////// create msg logic
//           const dbMessage = await Message.create({
//             chatId: chat._id,
//             sender: user._id,
//             receiver: to,
//             message,
//             messageTime: currentUnixTime,
//             seen: joinedPeopleCount > 1 ? true : false,
//             type: messageType,
//           });

//           const messages = await Message.find({
//             $and: [
//               {
//                 $or: [{ sender: user._id }, { receiver: user._id }],
//               },
//               {
//                 $or: [{ sender: to }, { receiver: to }],
//               },
//             ],
//           })
//             .populate("sender")
//             .populate("receiver")
//             .sort({ createdAt: -1 });

//           //////////// Notify

//           ///////////////////
//           // await sendNotification({
//           //   type: "sendMessage",
//           //   sender: user,
//           //   receiver,
//           //   title: "sent message",
//           //   deviceToken: receiver.deviceToken,
//           //   body: `${user.name} sent you a message`,
//           // });

//           io.to(chatId).emit("messages", {
//             success: true,
//             message: "Messages Retrieved Successfully",
//             receiver: receiveruser,
//             messages: [...messages],
//           });

//           if (joinedPeopleCount < 2) {
//             const tokens = [];
//             const notificationData = [];
//             const user1 = await User.findById(to);

//             const userTokens = JSON.parse(
//               JSON.stringify(await RefreshToken.find({ user: user1?.id }))
//             ).map(({ deviceToken }) => deviceToken);

//             if (user1.isNotification && userTokens.length > 0) {
//               tokens.push(...userTokens);
//               // notificationData.push({ ...user1 });
//               if (tokens.length > 0) {
//                 console.log(tokens, user._id, user.name);
//                 await SendNotificationMultiCast({
//                   tokens: tokens,
//                   sender: user._id,
//                   type: "sendMessage",
//                   title: "New Message",
//                   body: `${user.name} sent you a message`,
//                   data: {
//                     value: JSON.stringify(user),
//                   },
//                 });
//               }
//             }
//           }
//           ////////////// Receiver Logic

//           let ChatRooms;
//           ChatRooms = await Chat.find({ users: { $in: [to] } }).sort(
//             "-updatedAt"
//           );

//           ChatRooms = JSON.parse(JSON.stringify(ChatRooms));

//           for (let i = 0; i < ChatRooms.length; i++) {
//             const dbMessages = await Message.find({
//               $and: [
//                 { chatId: ChatRooms[i]._id },
//                 { seen: false },
//                 { receiver: { $eq: to } },
//               ],
//             });

//             ChatRooms[i].newMessages = dbMessages.length;
//           }
//           console.log("Rooms ==>", ChatRooms);

//           if (ChatRooms.length < 1) {
//             ChatRooms = null;
//           }
//           // socket.join(user._id);
//           io.to(to).emit("inboxes", {
//             success: true,
//             message: "Inbox Retrieved Succcessfully",
//             // data: { inboxes: [...inboxes], },
//             inboxes: [...ChatRooms],
//           });

//           // io.emit("new-message", {
//           //   success: true,
//           //   message: "Messages Found Successfully",
//           //   data: { message: dbMessage },
//           // });
//         } catch (error) {
//           console.log(error);
//         }
//       })
//     );

//     socket.on("disconnect", async () => {
//       console.log("User disconnected: ", socket.id);
//       if (userSocketID[socket.id]) {
//         await client.del(userSocketID[socket.id]);
//         delete userSocketID[`${socket.id}`];
//         if (userData[`${userSocketID[socket.id]}`]) {
//           delete userData[`${userSocketID[socket.id]}`];
//         }
//       }
//     });
//   });
// });

// module.exports = { io };
module.exports = socketapi;
