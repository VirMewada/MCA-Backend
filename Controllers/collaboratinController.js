const CollabReq = require("../Models/collaborationRequestModel.js");
const Team = require("../Models/teamModel.js");
const User = require("../Models/userModel");
const TxDeleter = require("../txDeleter");
const Gig = require("../Models/gigModel");
const catchAsync = require("../Utils/catchAsync");

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
  const collabReq = await CollabReq.find(
    req.query.query ? JSON.parse(decodeURIComponent(req.query.query)) : {}
  )
    .populate("gigId")
    .populate("Owner");

  // const userExists = await User.findById(req.Owner);

  res.status(200).json({
    status: 200,
    success: true,
    message: "",
    data: { collabReq },
  });
});

exports.store = catchAsync(async (req, res, next) => {
  const user = await User.findOne({ email: req.body.collaboratorEmail });
  if (user && user.role == "actor") {
    return res.status(400).json({
      status: 400,
      success: false,
      message: "Cannot collaborate with a talent",
    });
  }

  const alreadyExists = await CollabReq.findOne({
    gigId: req.body.gigId,
    owner: req.user._id,
    collaboratorEmail: req.body.collaboratorEmail,
  });

  if (alreadyExists) {
    if (alreadyExists.status === "rejected") {
      alreadyExists.status = "pending";
      await alreadyExists.save();

      return res.status(200).json({
        status: 200,
        success: true,
        message: "Request was previously rejected but has now been reopened.",
      });
    }

    if (alreadyExists.status === "pending") {
      return res.status(200).json({
        status: 200,
        success: false,
        message: "Request already exists and is pending.",
      });
    }
  }

  const collabReq = await CollabReq.create({
    ...JSON.parse(JSON.stringify(req.body)),
    owner: req.user._id,
  });

  res.status(200).json({
    status: 200,
    success: true,
    message: "Request Created Successfully",
    data: { collabReq },
  });
});

exports.update = catchAsync(async (req, res, next) => {
  const collabReq = await CollabReq.findByIdAndUpdate(
    req.params.id,
    { $set: JSON.parse(JSON.stringify(req.body)) },
    { new: true }
  );

  const gig = await Gig.findById(collabReq.gigId);
  const collaborator = await User.findOne({
    email: collabReq.collaboratorEmail,
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

  if (req.body.status === "accepted") {
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
        member.teamMemberEmail === collabReq.collaboratorEmail
    );

    if (indexInOwnerTeam > -1) {
      ownerTeam.members[indexInOwnerTeam].status = "accepted";
      ownerTeam.members[indexInOwnerTeam].user = collaborator._id;
    } else {
      ownerTeam.members.push({
        user: collaborator._id,
        teamMemberEmail: collabReq.collaboratorEmail,
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
    data: { collabReq },
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
