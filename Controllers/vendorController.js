const Vendor = require("../Models/vendorModel");
const Item = require("../Models/itemModel");
const catchAsync = require("../Utils/catchAsync");

//////////////////////////////////////////////////
// 🔍 Find Single Vendor
//////////////////////////////////////////////////
exports.find = catchAsync(async (req, res, next) => {
  const vendor = await Vendor.findOne({
    _id: req.params.id,
    is_deleted: false,
  }).populate({
    path: "items.item_id",
    select: "name code po_default_name type unit costing.weight category",
    populate: {
      path: "category",
      select: "full_path name code",
    },
  });

  res.status(200).json({
    status: 200,
    success: true,
    message: "",
    data: { vendor },
  });
});

//////////////////////////////////////////////////
// 📦 Get All Vendors (search supported)
//////////////////////////////////////////////////
exports.index = catchAsync(async (req, res, next) => {
  let query = { is_deleted: false };

  // 🔹 Search by name / phone / code
  if (req.query.search) {
    query.$or = [
      { name: { $regex: req.query.search, $options: "i" } },
      { phone: { $regex: req.query.search, $options: "i" } },
      { code: { $regex: req.query.search, $options: "i" } },
    ];
  }

  const vendors = await Vendor.find(query)
    .populate("items.item_id") // 🔥 THIS LINE
    .sort({ createdAt: -1 });

  res.status(200).json({
    status: 200,
    success: true,
    message: "",
    data: { vendors },
  });
});

//////////////////////////////////////////////////
// ➕ Create Vendor
//////////////////////////////////////////////////
exports.store = catchAsync(async (req, res, next) => {
  const body = JSON.parse(JSON.stringify(req.body));

  if (body.phone) {
    body.phone = body.phone.replace(/\D/g, "");
  }

  const vendor = await Vendor.create(body);

  // 🔥 Sync items → Item collection
  if (body.items && body.items.length > 0) {
    for (const i of body.items) {
      // update if exists
      await Item.updateOne(
        { _id: i.item_id, "vendors.vendor_id": vendor._id },
        {
          $set: {
            "vendors.$.last_price": i.last_price,
          },
        }
      );

      // insert if not exists
      await Item.updateOne(
        { _id: i.item_id, "vendors.vendor_id": { $ne: vendor._id } },
        {
          $push: {
            vendors: {
              vendor_id: vendor._id,
              last_price: i.last_price,
            },
          },
        }
      );
    }
  }

  res.status(200).json({
    status: 200,
    success: true,
    message: "Vendor Created Successfully",
    data: { vendor },
  });
});

//////////////////////////////////////////////////
// ✏️ Update Vendor
//////////////////////////////////////////////////
exports.update = catchAsync(async (req, res, next) => {
  const body = JSON.parse(JSON.stringify(req.body));

  if ("phone" in req.body && req.body.phone) {
    body.phone = req.body.phone.replace(/\D/g, "");
  }

  const vendor = await Vendor.findByIdAndUpdate(
    req.params.id,
    { $set: body },
    { new: true, runValidators: true }
  );

  // 🔥 Sync items → Item collection
  if (body.items && body.items.length > 0) {
    for (const i of body.items) {
      await Item.updateOne(
        { _id: i.item_id, "vendors.vendor_id": vendor._id },
        {
          $set: {
            "vendors.$.last_price": i.last_price,
          },
        }
      );

      await Item.updateOne(
        { _id: i.item_id, "vendors.vendor_id": { $ne: vendor._id } },
        {
          $push: {
            vendors: {
              vendor_id: vendor._id,
              last_price: i.last_price,
            },
          },
        }
      );
    }
  }

  res.status(200).json({
    status: 200,
    success: true,
    message: "Vendor Updated Successfully",
    data: { vendor },
  });
});

//////////////////////////////////////////////////
// ❌ Soft Delete Vendor
//////////////////////////////////////////////////
exports.delete = catchAsync(async (req, res, next) => {
  const filter = req.params.id
    ? { _id: req.params.id }
    : JSON.parse(decodeURIComponent(req.query));

  const result = await Vendor.updateMany(filter, {
    $set: { is_deleted: true },
  });

  res.status(200).json({
    status: 200,
    success: true,
    message: "Vendor Deleted Successfully",
    data: { result },
  });
});

exports.search = catchAsync(async (req, res, next) => {
  const search = req.query.search;
  const type = req.query.type || "all";

  if (!search) {
    return res.status(200).json({
      success: true,
      data: { vendors: [] },
    });
  }

  let vendorQuery = { is_deleted: false };

  // 🔹 NAME SEARCH
  if (type === "name") {
    vendorQuery.name = { $regex: search, $options: "i" };
  }

  // 🔹 CODE SEARCH
  else if (type === "code") {
    vendorQuery.code = { $regex: search, $options: "i" };
  }

  // 🔹 PHONE SEARCH (optional but useful)
  else if (type === "phone") {
    vendorQuery.phone = { $regex: search, $options: "i" };
  }

  // 🔹 ITEM SEARCH
  else if (type === "item") {
    const matchingItems = await Item.find({
      $or: [
        { name: { $regex: search, $options: "i" } },
        { code: { $regex: search, $options: "i" } },
      ],
    }).select("_id");

    const itemIds = matchingItems.map((i) => i._id);

    vendorQuery["items.item_id"] = { $in: itemIds };
  }

  // 🔹 ALL SEARCH (default)
  else {
    const matchingItems = await Item.find({
      $or: [
        { name: { $regex: search, $options: "i" } },
        { code: { $regex: search, $options: "i" } },
      ],
    }).select("_id");

    const itemIds = matchingItems.map((i) => i._id);

    vendorQuery.$or = [
      { name: { $regex: search, $options: "i" } },
      { phone: { $regex: search, $options: "i" } },
      { code: { $regex: search, $options: "i" } },
      { "items.item_id": { $in: itemIds } },
    ];
  }

  const vendors = await Vendor.find(vendorQuery)
    .populate("items.item_id")
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    data: { vendors },
  });
});

//////////////////////////////////////////////////
// 🔗 Map Vendor to Item
//////////////////////////////////////////////////
exports.mapVendorToItem = catchAsync(async (req, res, next) => {
  const { vendor_id, item_id, last_price } = req.body;

  if (!vendor_id || !item_id) {
    return res.status(400).json({
      success: false,
      message: "vendor_id and item_id required",
    });
  }

  // 🔹 Update if exists
  await Item.updateOne(
    { _id: item_id, "vendors.vendor_id": vendor_id },
    {
      $set: {
        "vendors.$.last_price": last_price,
      },
    }
  );

  // 🔹 Insert if not exists
  await Item.updateOne(
    { _id: item_id, "vendors.vendor_id": { $ne: vendor_id } },
    {
      $push: {
        vendors: {
          vendor_id,
          last_price,
        },
      },
    }
  );

  // 🔹 Vendor side sync
  await Vendor.updateOne(
    { _id: vendor_id, "items.item_id": item_id },
    {
      $set: {
        "items.$.last_price": last_price,
      },
    }
  );

  await Vendor.updateOne(
    { _id: vendor_id, "items.item_id": { $ne: item_id } },
    {
      $push: {
        items: {
          item_id,
          last_price,
        },
      },
    }
  );

  res.status(200).json({
    success: true,
    message: "Vendor mapped to item",
  });
});

//////////////////////////////////////////////////
// 🔄 Update Vendor-Item Relation
//////////////////////////////////////////////////
exports.updateVendorItem = catchAsync(async (req, res, next) => {
  const { vendor_id, item_id, last_price } = req.body;

  await Item.updateOne(
    { _id: item_id, "vendors.vendor_id": vendor_id },
    {
      $set: {
        "vendors.$.last_price": last_price,
      },
    }
  );

  await Vendor.updateOne(
    { _id: vendor_id, "items.item_id": item_id },
    {
      $set: {
        "items.$.last_price": last_price,
      },
    }
  );

  res.status(200).json({
    success: true,
    message: "Vendor-Item Updated",
  });
});

//////////////////////////////////////////////////
// ❌ Remove Vendor from Item
//////////////////////////////////////////////////
exports.removeVendorFromItem = catchAsync(async (req, res, next) => {
  const { vendor_id, item_id } = req.body;

  await Item.findByIdAndUpdate(item_id, {
    $pull: {
      vendors: { vendor_id },
    },
  });

  await Vendor.findByIdAndUpdate(vendor_id, {
    $pull: {
      items: { item_id },
    },
  });

  res.status(200).json({
    success: true,
    message: "Vendor removed from item",
  });
});
