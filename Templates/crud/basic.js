const <<Model>> = require("<<modelPath>>");
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
  const <<model>> = await <<Model>>.find({})

  res.status(200).json({
    status: 200,
    success: true,
    message: '',
    data: {<<model>>},
  });
});

exports.index = catchAsync(async (req, res, next) => {
  const <<model>> = await <<Model>>.find( req.query.query ? JSON.parse(decodeURIComponent(req.query.query)) : {})

  res.status(200).json({
    status: 200,
    success: true,
    message: '',
    data: {<<model>>},
  });
});

exports.store = catchAsync(async (req, res, next) => {
  const <<model>> = await <<Model>>.create({...JSON.parse(JSON.stringify(req.body)), user: req.user._id});

  res.status(200).json({
    status: 200,
    success: true,
    message: '<<Model>> Created Successfully',
    data: {<<model>>},
  });
});

exports.update = catchAsync(async (req, res, next) => {
    const <<model>> = await <<Model>>.findByIdAndUpdate(req.params.id, {$set: JSON.parse(JSON.stringify(req.body))}, { new: true });
  
    res.status(200).json({
      status: 200,
      success: true,
      message: '<<Model>> Edited',
      data: {<<model>>},
    });
});

exports.delete = catchAsync(async (req, res, next) => {
  let <<model>> =  await <<Model>>.deleteMany(req.params.id ? { _id: req.params.id } : JSON.parse(decodeURIComponent(req.query)))

  res.status(200).json({
      status: 200,
      success: true,
      message: '<<Model>> Deleted',
      data: {<<model>>},
    });
});
