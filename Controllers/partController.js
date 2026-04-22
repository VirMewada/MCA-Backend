const Part = require("../Models/partModel");
const catchAsync = require("../Utils/catchAsync");

/* Find Single Part */
exports.find = catchAsync(async (req, res, next) => {
  const part = await Part.findOne({
    _id: req.params.id,
  });

  res.status(200).json({
    status: 200,
    success: true,
    message: "",
    data: { part },
  });
});

/* Get All Parts */
exports.index = catchAsync(async (req, res, next) => {
  const parts = await Part.find(
    req.query.query ? JSON.parse(decodeURIComponent(req.query.query)) : {}
  );

  res.status(200).json({
    status: 200,
    success: true,
    message: "",
    data: { parts },
  });
});

/* Create Part */
exports.store = catchAsync(async (req, res, next) => {
  console.log("hi parts");
  const part = await Part.create({
    ...JSON.parse(JSON.stringify(req.body)),
  });

  res.status(200).json({
    status: 200,
    success: true,
    message: "Part Created Successfully",
    data: { part },
  });
});

/* Update Part */
exports.update = catchAsync(async (req, res, next) => {
  const part = await Part.findByIdAndUpdate(
    req.params.id,
    { $set: JSON.parse(JSON.stringify(req.body)) },
    { new: true }
  );

  res.status(200).json({
    status: 200,
    success: true,
    message: "Part Updated Successfully",
    data: { part },
  });
});

/* Delete Part */
exports.delete = catchAsync(async (req, res, next) => {
  const part = await Part.deleteMany(
    req.params.id
      ? { _id: req.params.id }
      : JSON.parse(decodeURIComponent(req.query))
  );

  res.status(200).json({
    status: 200,
    success: true,
    message: "Part Deleted Successfully",
    data: { part },
  });
});
