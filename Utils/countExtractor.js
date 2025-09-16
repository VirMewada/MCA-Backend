const countExtracter = async (req, model, condition, res) => {
  let size;
  size = await model.countDocuments(condition);
  return size;
};
module.exports = countExtracter;
