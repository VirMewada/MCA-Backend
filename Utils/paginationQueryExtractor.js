const APIFeatures = require("../Utils/apiFeatures");

const paginationQueryExtracter = async (req, model, condition) => {
  let data = [];
  let totalPages;

  req.query.limit = req.query.limit || 10;
  req.query.page = req.query.page || 1;

  const features = new APIFeatures(
    model.find(
      req.query.query ? JSON.parse(decodeURIComponent(req.query.query)) : {}
    ),
    req.query
  )
    .filter()
    .sorting()
    .field()
    .paging();

  data = await features.query;

  const countfeatures = new APIFeatures(
    model.find(
      req.query.query ? JSON.parse(decodeURIComponent(req.query.query)) : {}
    ),
    req.query
  )
    .filter()
    .field();

  const totalavailables = (await countfeatures.query).length;
  totalPages = Math.ceil(totalavailables / (req.query.limit * 1));
  return {
    data,
    totalPages,
    totalavailables,
  };
};
module.exports = paginationQueryExtracter;
