const Transaction = require("../Models/transactionModel");
const catchAsync = require("../Utils/catchAsync");
const factory = require("./handlersFactory");

exports.updateTransaction = factory.updateOne(Transaction);
exports.getallTransaction = catchAsync(async (req, res) => {
    const transactions = await Transaction.find({ user: req.user._id })
    res.json({
        status: 200,
        success: true,
        message: "",
        data: { transactions }
    })
});
exports.getOneTransaction = factory.getOne(Transaction);
exports.deleteTransaction = factory.deleteOne(Transaction);
