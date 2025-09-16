const Gig = require("../Models/gigModel");
const Role = require("../Models/roleModel");
const Application = require("../Models/applicationModel");
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

exports.index = catchAsync(async (req, res, next) => {
  console.log("Query:");

  const gigs = await Gig.find(
    req.query.query ? JSON.parse(decodeURIComponent(req.query.query)) : {}
  );

  const colloboratedGigs = await Gig.find({
    collaborators: { $in: [req.user._id] },
  });

  gigs.push(...colloboratedGigs);

  console.log("Total Gigs:", gigs.length);

  res.status(200).json({
    status: 200,
    success: true,
    message: "",
    data: { gigs },
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

exports.store = catchAsync(async (req, res, next) => {
  const newGig = await Gig.create({});

  const roles = [...req.body.roles];

  let outRoles = [];
  // for (let role in roles) {
  //   const newRole = await Role.create({
  //     ...role,
  //     gig: newGig._id,
  //   });
  //   outRoles.push(newRole._id);
  // }

  let isPaid = false;

  for (let i = 0; i < roles.length; i++) {
    const newRole = await Role.create({
      ...roles[i],
      gig: newGig._id,
    });
    outRoles.push(newRole._id);
    if (roles[i].isPaid) {
      isPaid = true; // If any role is paid, set isPaid to true
    }
  }

  delete req.body.roles;

  const gig = await Gig.findByIdAndUpdate(newGig._id, {
    ...JSON.parse(JSON.stringify(req.body)),
    user: req.user._id,
    roles: outRoles,
    isPaid: isPaid, // Explicitly updating isPaid
  });

  //  // Correctly updating isPaid
  //  const gig = await Gig.findByIdAndUpdate(
  //   newGig._id,
  //   {
  //     ...JSON.parse(JSON.stringify(req.body)),
  //     user: req.user._id,
  //     roles: outRoles,
  //     isPaid: isPaid, // Explicitly updating isPaid
  //   },
  // );

  res.status(200).json({
    status: 200,
    success: true,
    message: "Gig Created Successfully",
    data: { gig },
  });
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
