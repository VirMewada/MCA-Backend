const Gig = require("../Models/gigModel");
const Role = require("../Models/roleModel");
const Application = require("../Models/applicationModel");
const SavedDatabase = require("../Models/savedDatabaseModel");
const catchAsync = require("../Utils/catchAsync");

exports.find = catchAsync(async (req, res, next) => {
  const gig = await Gig.findOne({
    _id: req.params.id,
  })
    .populate("roles")
    .populate("user");

  let modifiedGig = { ...JSON.parse(JSON.stringify(gig)) };

  modifiedGig = {
    ...modifiedGig,
    roles: await Promise.all(
      modifiedGig.roles.map(async (role) => {
        let roleApplications = await Application.find({
          role: role._id,
        });
        role.noOfApplications = roleApplications.length;
        // return { ...role, noOfApplications: roleApplications.length };
        return role;
      })
    ),
  };

  const applications = await Application.find({
    requester: req?.user?._id,
    gig: req.params.id,
    status: { $in: ["accepted", "starred", "rejected"] },
  });

  (modifiedGig.acceptedApplication = applications.filter(
    (app) => app.status === "accepted"
  )),
    (modifiedGig.starredApplication = applications.filter(
      (app) => app.status === "starred"
    )),
    (modifiedGig.rejectedApplication = applications.filter(
      (app) => app.status === "rejected"
    ));

  res.status(200).json({
    status: 200,
    success: true,
    message: "",
    data: { gig: modifiedGig },
  });
});

//DONE
exports.index = catchAsync(async (req, res, next) => {
  const userId = req.user._id;

  const savedDatabases = await SavedDatabase.find({
    $or: [{ owner: userId }, { collaborators: { $in: [userId] } }],
  });

  if (!savedDatabases || savedDatabases.length === 0) {
    return res.status(200).json({
      status: 200,
      success: true,
      message: "No saved databases found for this user.",
      data: { savedDatabases: [] },
    });
  }

  res.status(200).json({
    status: 200,
    success: true,
    message: "Saved databases fetched successfully.",
    data: { savedDatabases },
  });
});

exports.gigActive = catchAsync(async (req, res, next) => {
  const today = new Date();

  // Base query: non-expired gigs only
  const baseQuery = req.query.query
    ? {
        $and: [
          JSON.parse(decodeURIComponent(req.query.query)),
          { expirationData: { $gte: today } },
        ],
      }
    : { expirationData: { $gte: today } };

  // 1. Gigs from main query
  const gigs = await Gig.find(baseQuery);

  // 2. Gigs where the user is a collaborator (and not expired)
  const collaboratedGigs = await Gig.find({
    collaborators: { $in: [req.user._id] },
    expirationData: { $gte: today },
  });

  // Merge both & remove duplicates (by _id)
  const allGigs = [...gigs, ...collaboratedGigs];
  const uniqueGigs = Array.from(
    new Map(allGigs.map((gig) => [gig._id.toString(), gig])).values()
  );

  res.status(200).json({
    status: 200,
    success: true,
    message: "",
    data: { gigs: uniqueGigs },
  });
});

//
exports.store = catchAsync(async (req, res, next) => {
  const userId = req.user._id;

  const {
    folderName,
    collaborators = [],
    savedUsers = [],
    // isCollaboration = false,
  } = req.body;

  // Optional: Validate required fields
  if (!folderName) {
    return res.status(400).json({
      status: 400,
      success: false,
      message: "Folder name is required.",
    });
  }

  let isCollaboration = false;

  if (collaborators.length > 0) {
    isCollaboration = true;
  }

  const newDatabase = await SavedDatabase.create({
    owner: userId,
    folderName,
    isCollaboration,
    collaborators,
    savedUsers,
  });

  res.status(201).json({
    status: 201,
    success: true,
    message: "Saved database created successfully.",
    data: { savedDatabase: newDatabase },
  });
});

exports.update = catchAsync(async (req, res, next) => {
  // const gig = await Gig.findByIdAndUpdate(
  //   req.params.id,
  //   { $set: JSON.parse(JSON.stringify(req.body)) },
  //   { new: true }
  // );

  const databaseId = req.params.id;
  const { savedUser } = req.body;

  // Check if database exists
  const savedDatabase = await SavedDatabase.findById(databaseId);
  if (!savedDatabase) {
    return res.status(404).json({
      status: 404,
      success: false,
      message: "Saved database not found.",
    });
  }
  // Convert ObjectIds to strings for comparison
  const userIdStr = String(savedUser);
  const savedUsersStr = savedDatabase.savedUsers.map((id) => String(id));

  let updatedSavedUsers;

  if (savedUsersStr.includes(userIdStr)) {
    // Remove user
    updatedSavedUsers = savedDatabase.savedUsers.filter(
      (id) => String(id) !== userIdStr
    );
  } else {
    // Add user
    updatedSavedUsers = [...savedDatabase.savedUsers, savedUser];
  }

  // Update database
  savedDatabase.savedUsers = updatedSavedUsers;
  await savedDatabase.save();

  res.status(200).json({
    status: 200,
    success: true,
    message: "Saved users list updated successfully.",
    data: { savedDatabase },
  });
});

exports.delete = catchAsync(async (req, res, next) => {
  let gig = await Gig.deleteMany(
    req.params.id
      ? { _id: req.params.id }
      : JSON.parse(decodeURIComponent(req.query))
  );

  res.status(200).json({
    status: 200,
    success: true,
    message: "Gig Deleted",
    data: { gig },
  });
});
