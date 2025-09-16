const Transaction = require("../Models/transactionModel");
const createTransactionPrint = async (userId, data) => {
  const transaction = await Transaction.create({
    creator: userId,
    amount: data.amount,
    transactionId: data.transactionId,
  });
  return transaction;
};
module.exports = {
  createTransactionPrint,
};
