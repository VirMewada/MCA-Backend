const Review = require("../Models/reviewModel.js");
const TxDeleter = require("../txDeleter");
const {
  Query,
  QueryModel,
  QueryBuilder,

  Matcher,
  Eq,

  PostProcessor
} = require("../Utils/query");
const catchAsync = require("../Utils/catchAsync");

exports.find = catchAsync(async (req, res, next) => {
  const review = await Review.find({})

  res.status(200).json({
    status: 200,
    success: true,
    message: '',
    data: {review},
  });
});

exports.index = catchAsync(async (req, res, next) => {
  const review = await Review.find( req.query.query ? JSON.parse(decodeURIComponent(req.query.query)) : {})

  res.status(200).json({
    status: 200,
    success: true,
    message: '',
    data: {review},
  });
});

exports.store = catchAsync(async (req, res, next) => {
  const review = await Review.create({...JSON.parse(JSON.stringify(req.body)), reviewer: req.user._id});

  res.status(200).json({
    status: 200,
    success: true,
    message: 'Review Created Successfully',
    data: {review},
  });
});

exports.update = catchAsync(async (req, res, next) => {
    const review = await Review.findByIdAndUpdate(req.params.id, {$set: JSON.parse(JSON.stringify(req.body))}, { new: true });
  
    res.status(200).json({
      status: 200,
      success: true,
      message: 'Review Edited',
      data: {review},
    });
});

exports.delete = catchAsync(async (req, res, next) => {
  let review =  await Review.findOne(req.params.id ? { _id: req.params.id } : JSON.parse(decodeURIComponent(req.query)))
  review = await TxDeleter.deleteOne("Review", req.params.id)

  res.status(200).json({
      status: 200,
      success: true,
      message: 'Review Deleted',
      data: {review},
    });
});
