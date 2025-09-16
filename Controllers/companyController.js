const Gig = require("../Models/gigModel");
const Role = require("../Models/roleModel");
const Application = require("../Models/applicationModel");
const catchAsync = require("../Utils/catchAsync");
const Company = require("../Models/companyModel");
const Drug = require("../Models/DrugModel");
const User = require("../Models/userModel");

exports.find = catchAsync(async (req, res, next) => {
  console.log("Query:", req.query.query, "\nreq: ", req.params.companyName);

  const company = await Company.findOne({
    name: new RegExp(`^${req.params.companyName}$`, "i"),
  });

  console.log("Company:", company);

  if (!company) {
    return res.status(200).json({
      status: 200,
      success: true,
      message: "Company not found",
      data: null,
    });
  }

  res.status(200).json({
    status: 200,
    success: true,
    message: "Found the company",
    data: { company },
  });
});

exports.findAll = catchAsync(async (req, res, next) => {
  const searchQuery = req.params.companyName || ""; // example: /company/all?query=abc

  // Use regex for partial, case-insensitive match
  const companies = await Company.find(
    { name: new RegExp(searchQuery, "i") }, // matches anywhere in the name
    { name: 1 } // only return the name field (_id comes by default unless excluded)
  );

  console.log("Query: ", searchQuery);
  console.log("Companies found:", companies);

  if (!companies.length) {
    return res.status(200).json({
      status: 200,
      success: true,
      message: "No companies found",
      data: [],
    });
  }

  res.status(200).json({
    status: 200,
    success: true,
    message: "Companies found",
    data: companies,
  });
});

exports.findAllDrugs = catchAsync(async (req, res, next) => {
  const searchQuery = req.params.drug || ""; // example: /company/all?drug=para

  // Find companies where any drug matches the search query
  // const companies = await Company.find(
  //   { drugs: { $regex: searchQuery, $options: "i" } },
  //   { name: 1, drugs: 1 } // return company name + drugs
  // );

  const companies = await Company.aggregate([
    {
      $match: {
        drugs: { $regex: searchQuery, $options: "i" },
      },
    },
    {
      $project: {
        name: 1,
        drugs: {
          $filter: {
            input: "$drugs",
            as: "drug",
            cond: {
              $regexMatch: {
                input: "$$drug",
                regex: searchQuery,
                options: "i",
              },
            },
          },
        },
      },
    },
  ]);

  console.log("Drug Query: ", searchQuery);
  console.log("Companies found:", companies);

  if (!companies.length) {
    return res.status(200).json({
      status: 200,
      success: true,
      message: "No drugs found",
      data: [],
    });
  }

  res.status(200).json({
    status: 200,
    success: true,
    message: "Drugs found",
    data: companies,
  });
});

exports.getCompanies = catchAsync(async (req, res, next) => {
  const { userId } = req.params;

  // Step 1: Find the user
  const user = await User.findById(userId).populate("companies");
  // assuming in User schema: companies: [{ type: mongoose.Schema.Types.ObjectId, ref: "Company" }]

  if (!user) {
    return res.status(404).json({
      status: 404,
      success: false,
      message: "User not found",
    });
  }

  // Step 2: Get companies (already populated if you used populate)
  const companies = user.companies;

  res.status(200).json({
    status: 200,
    success: true,
    message: "Found companies",
    data: { companies },
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
  console.log("Creating Gig with roles:", req.body);

  let companyId = null;

  if (req.body.newCompany && req.body.companyName) {
    // 1. Create Company with drugs in one go
    const company = await Company.create({
      name: req.body.companyName,
      drugs: Array.isArray(req.body.companies) ? req.body.companies : [],
    });

    companyId = company._id;

    // 2. Update User with new company
    await User.findByIdAndUpdate(req.user._id, {
      $addToSet: { companies: companyId },
    });
  } else if (req.body.companyName) {
    // ✅ Handle existing company case
    const company = await Company.findOneAndUpdate(
      { name: req.body.companyName }, // find by company name
      {
        $addToSet: {
          drugs: {
            $each: Array.isArray(req.body.companies) ? req.body.companies : [],
          },
        },
      },
      { new: true } // return the updated company
    );

    if (!company) {
      return res.status(404).json({
        status: 404,
        success: false,
        message: "Company not found",
      });
    }

    companyId = company._id;

    // Ensure user is linked to this company
    await User.findByIdAndUpdate(req.user._id, {
      $addToSet: { companies: companyId },
    });
  }

  res.status(200).json({
    status: 200,
    success: true,
    message: "Gig Created Successfully",
    data: { companyId },
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
