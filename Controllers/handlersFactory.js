const catchAsync = require("../Utils/catchAsync");
const AppErr = require("../Utils/appError");
const ApiFeatures = require("../Utils/apiFeatures");
const paginationQueryExtracter = require("../Utils/paginationQueryExtractor");
//  Factory function to delete a document
exports.deleteOne = (Model) =>
  catchAsync(async (req, res, next) => {
    // console.log(Model);
    // const id = req.params.id;
    const doc = await Model.findOneAndDelete({ _id: req.params.id });
    if (!doc) {
      return next(new AppErr("No document find with that Id", 404));
    }

    res.status(200).json({
      status: 204,
      success: true,
      data: null,
    });
  });

//   Factory function to Update a document
exports.updateOne = (Model) =>
  catchAsync(async (req, res, next) => {
    // console.log(req.params.id);
    const doc = await Model.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!doc) {
      return next(new AppErr("No document found with that Id", 404));
    }
    res.status(200).json({
      status: 200,
      success: true,
      data: {
        data: doc,
      },
    });
  });

// Factory function to create a document
exports.creatOne = (Model) =>
  catchAsync(async (req, res, next) => {
    const doc = await Model.create(req.body);
    // console.log("tourcontroller");
    res.status(201).json({
      status: 201,
      success: true,
      message: "Created",
      data: {
        data: doc,
      },
    });
  });

// :::::::::::::::::::::::::::Factory function for getting/reading  data. ::::::::::::::::::::::::::::

exports.getOne = (Model, popOptions) =>
  catchAsync(async (req, res, next) => {
    let query = await Model.findOne({ _id: req.params.id });
    if (popOptions) query = query.populate(popOptions);
    const doc = await query;
    if (!doc) {
      return next(new AppErr("No Document Found With Given Id ", 404));
    }

    res.json({
      status: 200,
      success: true,

      data: {
        data: doc,
      },
    });
  });

// :::::::::::::::::::::::::::Factory function for getting/reading ALL data. ::::::::::::::::::::::::::::

exports.getAll = (Model, popOptions) =>
  catchAsync(async (req, res, next) => {
    const doc = await paginationQueryExtracter(req, Model, req.query);
    res.json({
      status: 200,
      success: true,
      results: doc.length,
      data: {
        data: doc.data,
        totalPages: doc.totalPages,
        totalAvailable: doc.totalavailables,
      },
    });
  });
