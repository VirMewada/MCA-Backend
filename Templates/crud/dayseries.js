const <<Model>> = require("<<modelPath>>");
const TxDeleter = require("../txDeleter");
const catchAsync = require("../Utils/catchAsync");

exports.store = catchAsync(async (req, res, next) => {
  const <<model>>s = []
  const singular = !!<<singular>>
  if(singular) {
    let <<model>> = await <<Model>>.findOne({ date: req.body.date, user: req.user._id, identifier: req.body.identifier })
    if(<<model>>) <<model>> = await <<Model>>.updateOne({ _id: <<model>>._id }, { ...JSON.parse(JSON.stringify(req.body)) }, { new: true })
    else <<model>> = await <<Model>>.create({...JSON.parse(JSON.stringify(req.body)), user: req.user._id})
    <<model>>s.push(<<model>>)
  } else {
    for(const x of req.body.<<model>>s) {
      let <<model>> = await <<Model>>.findOne({ date: x.date, user: req.user._id, identifier: x.identifier })
      if(<<model>>) <<model>> = await <<Model>>.updateOne({ _id: <<model>>._id }, { ...JSON.parse(JSON.stringify(x)) }, { new: true })
      else <<model>> = await <<Model>>.create({...JSON.parse(JSON.stringify(x)), user: req.user._id})
      <<model>>s.push(<<model>>)
    }
  }

  res.status(200).json({
    status: 200,
    success: true,
    message: '<<Model>> Created Successfully',
    data: {<<model>>s},
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
    const <<model>> = await TxDeleter.deleteOne("<<Model>>", req.params.id)

    res.status(200).json({
      status: 200,
      success: true,
      message: '<<Model>> Deleted',
      data: {<<model>>},
    });
});
