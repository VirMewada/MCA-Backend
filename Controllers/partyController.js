const Party = require("../Models/partyModel");
const SalesOrder = require("../Models/salesOrderModel");
const catchAsync = require("../Utils/catchAsync");

/** Escape user input before it goes into a $regex — otherwise a stray "(" is a crash. */
const rx = (s) => new RegExp(String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

exports.index = catchAsync(async (req, res) => {
  const query = { is_deleted: false };

  if (req.query.search?.trim()) {
    const term = rx(req.query.search.trim());
    query.$or = [
      { name: term },
      { code: term },
      { phone: term },
      { email: term },
      { gst: term },
    ];
  }

  const limit = Math.min(Number(req.query.limit) || 200, 500);

  const parties = await Party.find(query)
    .sort({ name: 1 })
    .limit(limit)
    .lean();

  res.status(200).json({
    success: true,
    data: { parties },
  });
});

exports.find = catchAsync(async (req, res) => {
  const party = await Party.findOne({
    _id: req.params.id,
    is_deleted: false,
  }).lean();

  if (!party) {
    return res
      .status(404)
      .json({ success: false, message: "Party not found." });
  }

  // Recent orders give the party page something useful to show.
  const orders = await SalesOrder.find({
    party_id: party._id,
    is_deleted: false,
  })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  const totalBusiness = orders
    .filter((o) => o.status !== "cancelled")
    .reduce((sum, o) => sum + (o.grand_total ?? o.total_amount ?? 0), 0);

  res.status(200).json({
    success: true,
    data: { party, orders, totalBusiness },
  });
});

exports.store = catchAsync(async (req, res) => {
  const name = req.body?.name?.trim();

  if (!name) {
    return res
      .status(400)
      .json({ success: false, message: "Party name is required." });
  }

  // Case-insensitive duplicate guard. Creating the same customer twice is the
  // most common data-quality problem in a system where anyone can add one
  // mid-order.
  const existing = await Party.findOne({
    name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
    is_deleted: false,
  }).lean();

  if (existing) {
    return res.status(409).json({
      success: false,
      message: `A party named "${existing.name}" already exists.`,
      data: { party: existing },
    });
  }

  const party = await Party.create({ ...req.body, name });

  res.status(201).json({ success: true, data: { party } });
});

exports.update = catchAsync(async (req, res) => {
  const body = { ...req.body };
  delete body._id;
  delete body.is_deleted;

  const party = await Party.findOneAndUpdate(
    { _id: req.params.id, is_deleted: false },
    { $set: body },
    { new: true, runValidators: true }
  );

  if (!party) {
    return res
      .status(404)
      .json({ success: false, message: "Party not found." });
  }

  res.status(200).json({ success: true, data: { party } });
});

exports.delete = catchAsync(async (req, res) => {
  // Refuse to remove a party that still has live orders — otherwise those
  // orders render with a dangling reference and no name.
  const liveOrders = await SalesOrder.countDocuments({
    party_id: req.params.id,
    is_deleted: false,
    status: { $nin: ["closed", "cancelled"] },
  });

  if (liveOrders > 0) {
    return res.status(400).json({
      success: false,
      message: `This party has ${liveOrders} open order(s). Close or cancel them before removing the party.`,
    });
  }

  await Party.updateOne(
    { _id: req.params.id },
    { $set: { is_deleted: true } }
  );

  res.status(200).json({ success: true, message: "Party removed." });
});
