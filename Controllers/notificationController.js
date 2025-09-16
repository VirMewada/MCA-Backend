const CollabReq = require("../Models/collaborationRequestModel.js");
const Team = require("../Models/teamModel.js");
const User = require("../Models/userModel.js");
const TxDeleter = require("../txDeleter.js");
const Gig = require("../Models/gigModel.js");
const fetch = require("node-fetch");
const {
  Query,
  QueryModel,
  QueryBuilder,
  Matcher,
  Eq,
  PostProcessor,
} = require("../Utils/query.js");
const catchAsync = require("../Utils/catchAsync.js");
const Notification = require("../Models/NotificationModel.js");
const handleCollaborationInvite = require("../services/notificationhandlers/handleCollaborationInvite.js");

exports.find = catchAsync(async (req, res, next) => {
  const collabReq = await CollabReq.find({});

  res.status(200).json({
    status: 200,
    success: true,
    message: "",
    data: { collabReq },
  });
});

exports.index = catchAsync(async (req, res, next) => {
  const notif = await Notification.find(
    req.query.query ? JSON.parse(decodeURIComponent(req.query.query)) : {}
  )
    .populate({
      path: "sender",
      select: "firstName", // only get firstName
    })
    .populate({
      path: "data.gigId",
      model: "Gig",
      select: "projectTitle", // only get projectTitle
    });

  res.status(200).json({
    status: 200,
    success: true,
    message: "",
    data: { notif },
  });
});

exports.store = catchAsync(async (req, res, next) => {
  const { type } = req.body;

  const handlers = {
    collaboration_invite: handleCollaborationInvite,
    // other types in future
  };

  const handler = handlers[type];

  if (!handler) {
    return res.status(400).json({
      success: false,
      message: "Invalid notification type.",
    });
  }

  const result = await handler(req);
  return res.status(result.status).json(result);
});

exports.markSeen = catchAsync(async (req, res, next) => {
  const { recipientEmail } = req.body;

  if (!recipientEmail) {
    return res.status(400).json({
      success: false,
      message: "Recipient email is required.",
    });
  }

  const result = await Notification.updateMany(
    { recipientEmail, seen: false },
    { $set: { seen: true } }
  );

  return res.status(200).json({
    success: true,
    message: "All notifications marked as seen.",
    modifiedCount: result,
  });
});

exports.update = catchAsync(async (req, res, next) => {
  const notif = await Notification.findByIdAndUpdate(
    req.params.id,
    { $set: JSON.parse(JSON.stringify(req.body)) },
    { new: true }
  );

  const gig = await Gig.findById(notif.data.gigId);
  const collaborator = await User.findOne({
    email: notif.recipientEmail,
  });
  const owner = await User.findById(gig.user); // gig owner
  const ownerEmail = owner?.email;

  if (!collaborator || !owner) {
    return res.status(404).json({
      status: 404,
      success: false,
      message: "One or both users not found",
    });
  }

  if (req.body.action === "accepted") {
    // ✅ Add collaborator to the gig if not already added
    if (!gig.collaborators.includes(collaborator._id)) {
      gig.collaborators.push(collaborator._id);
      await gig.save();
    }

    // ✅ Update/create team for OWNER
    let ownerTeam = await Team.findOne({ owner: owner._id });
    if (!ownerTeam) {
      ownerTeam = new Team({ owner: owner._id, members: [] });
    }

    let indexInOwnerTeam = ownerTeam.members.findIndex(
      (member) =>
        member.user?.toString() === collaborator._id.toString() ||
        member.teamMemberEmail === notif.recipientEmail
    );

    if (indexInOwnerTeam > -1) {
      ownerTeam.members[indexInOwnerTeam].status = "accepted";
      ownerTeam.members[indexInOwnerTeam].user = collaborator._id;
    } else {
      ownerTeam.members.push({
        user: collaborator._id,
        teamMemberEmail: notif.recipientEmail,
        status: "accepted",
        invitedAt: new Date(),
      });
    }
    await ownerTeam.save();

    // ✅ Update/create team for COLLABORATOR
    let collaboratorTeam = await Team.findOne({ owner: collaborator._id });
    if (!collaboratorTeam) {
      collaboratorTeam = new Team({ owner: collaborator._id, members: [] });
    }

    let indexInCollabTeam = collaboratorTeam.members.findIndex(
      (member) =>
        member.user?.toString() === owner._id.toString() ||
        member.teamMemberEmail === ownerEmail
    );

    if (indexInCollabTeam > -1) {
      collaboratorTeam.members[indexInCollabTeam].status = "accepted";
      collaboratorTeam.members[indexInCollabTeam].user = owner._id;
    } else {
      collaboratorTeam.members.push({
        user: owner._id,
        teamMemberEmail: ownerEmail,
        status: "accepted",
        invitedAt: new Date(),
      });
    }
    await collaboratorTeam.save();
  }

  res.status(200).json({
    status: 200,
    success: true,
    message: "Request Updated",
    data: { notif },
  });
});

exports.delete = catchAsync(async (req, res, next) => {
  let collabReq = await CollabReq.findOne(
    req.params.id
      ? { _id: req.params.id }
      : JSON.parse(decodeURIComponent(req.query))
  );
  collabReq = await TxDeleter.deleteOne("CollaborationRequest", req.params.id);

  res.status(200).json({
    status: 200,
    success: true,
    message: "Request Deleted",
    data: { collabReq },
  });
});

exports.sendNotifications = catchAsync(async (req, res, next) => {
  const { title, body, users } = req.body;

  console.log("Sending notifications with title:", req.body);

  if (!title || !body || !Array.isArray(users)) {
    return {
      status: 400,
      success: false,
      message: "Missing title, body, or users array.",
    };
  }

  const pushMessages = [];

  users.forEach((user) => {
    (user.pushTokens || []).forEach((tokenObj) => {
      if (tokenObj.expoPushToken) {
        pushMessages.push({
          to: tokenObj.expoPushToken,
          title,
          body,
          sound: "default",
          data: {
            type: "custom_push",
            userId: user.userId,
          },
        });
      }
    });
  });

  if (pushMessages.length === 0) {
    return {
      status: 400,
      success: false,
      message: "No valid push tokens found.",
    };
  }

  console.log("pushMessages:", pushMessages);

  try {
    const results = await Promise.all(
      pushMessages.map((msg) =>
        fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Accept-Encoding": "gzip, deflate",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(msg),
        })
      )
    );

    const jsonResults = await Promise.all(results.map((r) => r.json()));

    return {
      status: 200,
      success: true,
      message: "Notifications sent successfully.",
      results: jsonResults,
    };
  } catch (error) {
    console.error("Expo push error:", error);
    return {
      status: 500,
      success: false,
      message: "Failed to send notifications.",
    };
  }
});
