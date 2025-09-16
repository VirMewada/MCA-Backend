const Team = require("../Models/teamModel");
const catchAsync = require("../Utils/catchAsync");

exports.find = catchAsync(async (req, res, next) => {
  const { userId } = req.params;

  const teamOwner = await Team.findOne({ owner: userId }).populate({
    path: "members.user",
    select: "firstName lastName image", // Select only these fields
  });
  const teams = teamOwner ? teamOwner.members : [];

  res.status(200).json({
    status: 200,
    success: true,
    message: "",
    data: { teams },
  });
});
