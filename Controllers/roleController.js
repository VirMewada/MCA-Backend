const Role = require("../Models/roleModel");
const TxDeleter = require("../txDeleter");
const mongoose = require("mongoose");

const {
  Query,
  QueryModel,
  QueryBuilder,

  Matcher,
  Eq,

  PostProcessor,
} = require("../Utils/query");
const catchAsync = require("../Utils/catchAsync");

exports.find = catchAsync(async (req, res, next) => {
  // const roles = await Role.find({});

  // res.status(200).json({
  //   status: 200,
  //   success: true,
  //   message: "",
  //   data: { roles },
  // });
  const { id } = req.params; // Extract ID from URL params

  // Check if the provided ID is valid
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      status: 400,
      success: false,
      message: "Invalid role ID",
    });
  }

  const role = await Role.findById(id);

  if (!role) {
    return res.status(404).json({
      status: 404,
      success: false,
      message: "Role not found",
    });
  }

  res.status(200).json({
    status: 200,
    success: true,
    message: "Role found",
    data: { role },
  });
});

exports.index = catchAsync(async (req, res, next) => {
  const { query } = req.query;

  // Parse the query if it exists
  let filter = query ? JSON.parse(decodeURIComponent(query)) : {};

  // Ensure `_id` is properly formatted as a MongoDB ObjectId if `role` exists
  // if (filter.role) {
  //   filter._id = new mongoose.Types.ObjectId(filter.role);
  //   delete filter.role; // Remove role from the query
  // }

  if (filter.role) {
    filter._id = {
      $in: filter.role.map((id) => new mongoose.Types.ObjectId(id)),
    };
    delete filter.role;
  }

  const roles = await Role.find(filter);

  res.status(200).json({
    status: 200,
    success: true,
    message: "",
    data: { roles }, // Return a single role instead of an array
  });
});

exports.store = catchAsync(async (req, res, next) => {
  const role = await Role.create({
    ...JSON.parse(JSON.stringify(req.body)),
    gig: req.body.gig,
  });

  res.status(200).json({
    status: 200,
    success: true,
    message: "Role Created Successfully",
    data: { role },
  });
});

exports.update = catchAsync(async (req, res, next) => {
  const role = await Role.findByIdAndUpdate(
    req.params.id,
    { $set: JSON.parse(JSON.stringify(req.body)) },
    { new: true }
  );

  res.status(200).json({
    status: 200,
    success: true,
    message: "Role Edited",
    data: { role },
  });
});

exports.delete = catchAsync(async (req, res, next) => {
  let role = await Role.deleteMany(
    req.params.id
      ? { _id: req.params.id }
      : JSON.parse(decodeURIComponent(req.query))
  );

  res.status(200).json({
    status: 200,
    success: true,
    message: "Role Deleted",
    data: { role },
  });
});
