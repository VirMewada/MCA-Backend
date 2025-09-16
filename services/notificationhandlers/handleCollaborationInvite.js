const Notification = require("../../Models/NotificationModel");
const pushToken = require("../../Models/pushTokenModel");
const User = require("../../Models/userModel");
const fetch = require("node-fetch");

const handleCollaborationInvite = async (req) => {
  const { recipientEmail, gigId, type } = req.body;
  const senderId = req.user._id;

  const user = await User.findOne({ email: recipientEmail });

  if (user && user.role === "actor") {
    return {
      status: 400,
      success: false,
      message: "Cannot collaborate with a talent",
    };
  }

  const alreadyExists = await Notification.findOne({
    "data.gigId": gigId,
    sender: senderId,
    recipientEmail,
    type,
  });

  if (alreadyExists) {
    if (alreadyExists.action === "rejected") {
      alreadyExists.action = "pending";
      await alreadyExists.save();

      return {
        status: 200,
        success: true,
        message: "Request was previously rejected but has now been reopened.",
      };
    }

    return {
      status: 200,
      success: false,
      message: "Request already exists and is pending.",
    };
  }

  const notification = await Notification.create({
    type,
    sender: senderId,
    recipient: user ? user._id : null,
    recipientEmail,
    title: "Collaboration Request",
    message: "You've been invited to Collaborate on a new Project!",
    data: { gigId },
    action: "pending",
  });

  if (user) {
    const tokenDoc = await pushToken.findOne({ userId: user._id });
    if (tokenDoc?.expoPushToken) {
      const message = {
        to: tokenDoc.expoPushToken,
        sound: "default",
        title: "New Collaboration Request!",
        body: "You've been invited to Collaborate on a new Project!",
        data: { notificationId: notification._id },
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
    }
  }

  const populatedNotification = await Notification.findById(notification._id)
    .populate({
      path: "sender",
      select: "firstName", // Only populate firstName (you can add _id if needed)
    })
    .populate({
      path: "data.gigId",
      model: "Gig",
      select: "projectTitle", // only get projectTitle
    });

  return {
    status: 200,
    success: true,
    message: "Notification sent successfully",
    data: { notification: populatedNotification },
  };
};

module.exports = handleCollaborationInvite;
