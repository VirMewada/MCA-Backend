const Application = require("../Models/applicationModel");
const Role = require("../Models/roleModel");
const Gig = require("../Models/gigModel");
const PushToken = require("../Models/pushTokenModel");
const catchAsync = require("../Utils/catchAsync");
const { default: mongoose } = require("mongoose");
const fetch = require("node-fetch");

exports.find = catchAsync(async (req, res, next) => {
  const { id, status } = req.params; // Extract role ID from params

  // Ensure `id` is a valid ObjectId
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      status: 400,
      success: false,
      message: "Invalid role ID",
    });
  }

  // Filter applications where `role` matches the provided ID
  const applications = await Application.find({ role: id, status: status });

  res.status(200).json({
    status: 200,
    success: true,
    message: "",
    data: { applications },
  });
});

exports.exists = catchAsync(async (req, res, next) => {
  const { id } = req.params; // Extract role ID from params
  const { roleId } = req.query; // Extract roleId from query

  // Ensure `id` is a valid ObjectId
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      status: 400,
      success: false,
      message: "Invalid role ID",
    });
  }

  // Filter applications where `role` matches the provided ID
  const applications = await Application.findOne({
    applicant: id,
    role: roleId,
  });

  res.status(200).json({
    status: 200,
    success: true,
    message: "",
    data: { applications },
  });
});

exports.index = catchAsync(async (req, res, next) => {
  let applications;
  const parsedQuery = JSON.parse(req.query.query);
  const { populateOnly = "applicant" } = parsedQuery; // 👈 default set to "all"

  // Basic DB query (role, gig, status filtering via MongoDB)
  const mongoQuery = {};
  if (parsedQuery.role) mongoQuery.role = parsedQuery.role;
  if (parsedQuery.gig) mongoQuery.gig = parsedQuery.gig;
  if (parsedQuery.status) mongoQuery.status = parsedQuery.status;

  if (populateOnly === "all") {
    applications = await Application.find(mongoQuery)
      .populate("applicant")
      .populate("role")
      .populate("gig");
    // .populate("requester");
  } else {
    applications = await Application.find(mongoQuery).populate("applicant");
  }

  // Filter by interests
  if (parsedQuery?.interests?.length) {
    let modifiedApplication = JSON.parse(JSON.stringify(applications));
    applications = modifiedApplication.filter((app) => {
      const userInterests = app.applicant.interests || [];
      return userInterests.some((interest) =>
        parsedQuery.interests.includes(interest)
      );
    });
  }

  // Filter by gender
  if (parsedQuery?.gender) {
    let modifiedApplication = JSON.parse(JSON.stringify(applications));
    applications = modifiedApplication.filter(
      (app) =>
        app.applicant.appearance.gender.toLowerCase() ===
        parsedQuery.gender.toLowerCase()
    );
  }

  // Filer by ethnicity
  if (parsedQuery?.ethnicity) {
    let modifiedApplication = JSON.parse(JSON.stringify(applications));
    applications = modifiedApplication.filter(
      (app) =>
        app.applicant.appearance.ethnicity.toLowerCase() ==
        parsedQuery.ethnicity.toLowerCase()
    );
  }

  // Filer by state
  if (parsedQuery?.state) {
    let modifiedApplication = JSON.parse(JSON.stringify(applications));
    applications = modifiedApplication.filter(
      (app) =>
        app.applicant.state.toLowerCase() == parsedQuery.state.toLowerCase()
    );
  }

  // Filer by city
  if (parsedQuery?.city) {
    let modifiedApplication = JSON.parse(JSON.stringify(applications));
    applications = modifiedApplication.filter(
      (app) =>
        app.applicant.city.toLowerCase() == parsedQuery.city.toLowerCase()
    );
  }

  /// Filter by age
  if (parsedQuery?.minAge && parsedQuery?.maxAge) {
    const minAge = Number(parsedQuery.minAge);
    const maxAge = Number(parsedQuery.maxAge);
    let modifiedApplication = JSON.parse(JSON.stringify(applications));
    applications = modifiedApplication.filter((app) => {
      const applicantMinAge = Number(app.applicant.appearance.ageMin);
      const applicantMaxAge = Number(app.applicant.appearance.ageMax);
      // Check if ranges overlap
      const isOverlap = applicantMinAge <= maxAge && applicantMaxAge >= minAge;
      return isOverlap;
    });
  }

  /// Filter by height
  if (parsedQuery?.minHeight && parsedQuery?.maxHeight) {
    const minHeight = Number(parsedQuery.minHeight);
    const maxHeight = Number(parsedQuery.maxHeight);
    let modifiedApplication = JSON.parse(JSON.stringify(applications));

    applications = modifiedApplication.filter((app) => {
      const applicanHeight = Number(app.applicant.appearance.height);
      return applicanHeight <= maxHeight && applicanHeight >= minHeight;
    });
  }

  // Filer by bodyType
  if (parsedQuery?.bodyType) {
    let modifiedApplication = JSON.parse(JSON.stringify(applications));
    applications = modifiedApplication.filter(
      (app) =>
        app.applicant.appearance.bodyType.toLowerCase() ==
        parsedQuery.bodyType.toLowerCase()
    );
  }

  // Filter by languages
  if (parsedQuery?.languages?.length) {
    let modifiedApplication = JSON.parse(JSON.stringify(applications));
    applications = modifiedApplication.filter((app) => {
      const userInterests = app.applicant.languages || [];
      return userInterests.some((language) =>
        parsedQuery.languages.includes(language)
      );
    });
  }

  // Filter by skills
  if (parsedQuery?.skills?.length) {
    let modifiedApplication = JSON.parse(JSON.stringify(applications));
    applications = modifiedApplication.filter((app) => {
      const userInterests = app.applicant.skills || [];
      return userInterests.some((skill) => parsedQuery.skills.includes(skill));
    });
  }

  // Filter by sceneComfort
  if (parsedQuery?.sceneComfort?.length) {
    let modifiedApplication = JSON.parse(JSON.stringify(applications));
    applications = modifiedApplication.filter((app) => {
      const userInterests = app.applicant.sceneComfort || [];
      return userInterests.some((scene) =>
        parsedQuery.sceneComfort.includes(scene)
      );
    });
  }

  res.status(200).json({
    status: 200,
    success: true,
    message: "",
    data: { applications },
  });
});

exports.store = catchAsync(async (req, res, next) => {
  const { roleId, additionalAnswer, applicationLinks } = req.body;
  let role = await Role.findById(roleId);
  let gigId = role.gig;
  let gig = await Gig.findById(gigId);
  let applicantId = req.user._id;
  let userId = gig.user;

  // Check if the applicant has already applied for the role
  let alreadyApplied = await Application.findOne({
    role: roleId,
    applicant: applicantId,
  });

  if (alreadyApplied) {
    return res.status(400).json({
      status: 400,
      success: false,
      message: "You have already applied for this role",
    });
  }

  // If application doesn't exist, increment the number of applicants for the role
  if (!alreadyApplied) {
    role.noOfApplicants += 1;
    await role.save();
  }

  const body = {
    requester: userId,
    applicant: applicantId,
    role: roleId,
    gig: gigId,
    additionalAnswer: additionalAnswer,
    applicationLinks: applicationLinks, // <-- This is the key change
  };

  // Create and store the new application
  const application = await Application.create({
    ...JSON.parse(JSON.stringify(body)),
  });

  res.status(200).json({
    status: 200,
    success: true,
    message: "Application Created Successfully",
    data: { application },
  });
});

exports.updateStatus = catchAsync(async (req, res, next) => {
  const application = await Application.findByIdAndUpdate(
    req.body._id,
    { $set: JSON.parse(JSON.stringify(req.body)) },
    { new: true }
  );

  if (req.body.status == "Accepted") {
    let role = await Role.findById(req.body.role);
    await Role.updateOne(
      {
        _id: req.body.role,
      },
      {
        $set: { isLive: false },
      }
    );

    const applicantId = application.applicant?._id;
    const tokenDoc = await PushToken.findOne({ userId: applicantId });
    if (tokenDoc?.expoPushToken) {
      const message = {
        to: tokenDoc.expoPushToken,
        sound: "default",
        title: "Application Accepted",
        body: `Your application for the role "${role?.title}" has been accepted!`,
        data: { applicationId: req.body._id },
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

  res.status(200).json({
    status: 200,
    success: true,
    message: "Application Edited",
    data: { application },
  });
});

exports.update = catchAsync(async (req, res, next) => {
  const application = await Application.findByIdAndUpdate(
    req.params.id,
    { $set: JSON.parse(JSON.stringify(req.body)) },
    { new: true }
  );

  res.status(200).json({
    status: 200,
    success: true,
    message: "Application Edited",
    data: { application },
  });
});

exports.delete = catchAsync(async (req, res, next) => {
  let application = await Application.deleteMany(
    req.params.id
      ? { _id: req.params.id }
      : JSON.parse(decodeURIComponent(req.query))
  );

  res.status(200).json({
    status: 200,
    success: true,
    message: "Application Deleted",
    data: { application },
  });
});
