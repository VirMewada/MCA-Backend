const Gig = require("../Models/gigModel");
const Application = require("../Models/applicationModel");
const PushToken = require("../Models/pushTokenModel");
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

// exports.index = catchAsync(async (req, res, next) => {
//   const gigs = await Gig.find(
//     req.query.query ? JSON.parse(decodeURIComponent(req.query.query)) : {}
//   );

//   const colloboratedGigs = await Gig.find({
//     collaborators: { $in: [req.user._id] },
//   });

//   gigs.push(...colloboratedGigs);

//   res.status(200).json({
//     status: 200,
//     success: true,
//     message: "",
//     data: { gigs },
//   });
// });

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
  const { userId, token, role, deviceId } = req.body; // Expecting these from the frontend
  console.log("Received push token data:", req.body);

  // Basic validation
  if (!userId || !token || !role) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields: userId, token, or role.",
    });
  }

  try {
    // Upsert logic: Find a document matching the userId, expoPushToken, and role.
    // If found, update its timestamp. If not found, create a new document.
    const filter = { userId: userId, expoPushToken: token, role: role };
    const update = {
      $set: { updatedAt: new Date(), deviceId: deviceId || null }, // Update deviceId if provided
      $setOnInsert: { createdAt: new Date() }, // Ensure createdAt is set on insert (though timestamps:true handles this)
    };
    const options = { upsert: true, new: true, setDefaultsOnInsert: true }; // 'new' returns the updated document

    let pushTokenEntry = await PushToken.findOneAndUpdate(
      filter,
      update,
      options
    );

    console.log(`Push token for User ${userId} (Role: ${role}) saved/updated.`);
    // console.log("Saved Token Entry:", pushTokenEntry); // Uncomment for detailed logging

    res.status(200).json({
      success: true,
      message: "Push token saved/updated successfully.",
      data: pushTokenEntry,
    });
  } catch (error) {
    console.error("Error saving push token:", error);

    // Handle duplicate key error from unique index (if you added one)
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          "Push token for this user and role already exists and is up-to-date.",
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to save push token due to server error.",
      error: error.message,
    });
  }
});

// NEW API: Fetch all users with their push tokens
exports.index = catchAsync(async (req, res, next) => {
  try {
    // 1. Find all PushToken entries
    // 2. Populate the 'userId' field with selected user details
    // 3. Group the push tokens by user to get the desired output structure

    const pushTokens = await PushToken.find({})
      .populate({
        path: "userId",
        select: "firstName lastName email role isAdmin", // Select the fields you need from the User model
      })
      .lean(); // Use .lean() for plain JavaScript objects, improving performance

    // Grouping tokens by user
    const usersWithTokens = {};

    pushTokens.forEach((tokenDoc) => {
      // Ensure userId exists and is populated
      if (tokenDoc.userId) {
        const userId = tokenDoc.userId._id.toString(); // Convert ObjectId to string for key
        const user = tokenDoc.userId;

        if (!usersWithTokens[userId]) {
          // Initialize user entry if it doesn't exist
          usersWithTokens[userId] = {
            userId: user._id,
            userName: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
            userEmail: user.email,
            userType: user.role, // Assuming 'role' in User model is what you mean by 'userType'
            pushTokens: [],
            isAdmin: user.isAdmin, // Assuming 'isAdmin' in User model is what you mean by 'isAdmin'
          };
        }
        // Add the push token details to the user's array
        usersWithTokens[userId].pushTokens.push({
          expoPushToken: tokenDoc.expoPushToken,
          role: tokenDoc.role, // This role is from the PushToken document itself
          deviceId: tokenDoc.deviceId,
          createdAt: tokenDoc.createdAt,
          updatedAt: tokenDoc.updatedAt,
        });
      }
    });

    // Convert the object of grouped users back into an array
    const result = Object.values(usersWithTokens);

    res.status(200).json({
      success: true,
      count: result.length,
      data: result,
    });
  } catch (error) {
    console.error("Error fetching users with push tokens:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch users with push tokens due to server error.",
      error: error.message,
    });
  }
});

exports.update = catchAsync(async (req, res, next) => {
  const gig = await Gig.findByIdAndUpdate(
    req.params.id,
    { $set: JSON.parse(JSON.stringify(req.body)) },
    { new: true }
  );

  res.status(200).json({
    status: 200,
    success: true,
    message: "Gig Edited",
    data: { gig },
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
