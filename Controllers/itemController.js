const Item = require("../Models/itemModel");
const Vendor = require("../Models/vendorModel");
const Transaction = require("../Models/transactionModel");
const catchAsync = require("../Utils/catchAsync");
const { runAnalyticsForAllItems } = require("../cron/analyticsService");

//////////////////////////////////////////////////
// 🔍 Find Single Item (with children populated)
//////////////////////////////////////////////////
exports.find = catchAsync(async (req, res, next) => {
  const item = await Item.findOne({
    _id: req.params.id,
    is_deleted: false,
  }).populate("children.item_id");

  res.status(200).json({
    status: 200,
    success: true,
    message: "",
    data: { item },
  });
});

//////////////////////////////////////////////////
// 📦 Get All Items (filter + search + type)
//////////////////////////////////////////////////
exports.index = catchAsync(async (req, res, next) => {
  console.log("Query Params:", req.query);

  let query = { is_deleted: false };

  // 🔹 Filter by type (part / assembly / main)
  if (req.query.type) {
    const types = req.query.type.split(",").map((t) => t.trim());

    query.type = { $in: types };
  }

  // 🔹 Search by name or code
  if (req.query.search) {
    query.$or = [
      { name: { $regex: req.query.search, $options: "i" } },
      { code: { $regex: req.query.search, $options: "i" } },
    ];
  }

  // const items = await Item.find(query).sort({ createdAt: -1 });
  const items = await Item.find(query)
    .populate({
      path: "children.item_id",
      select: "name type costing",
    })
    .populate({
      path: "vendors.vendor_id",
      select: "name phone code",
    })
    .sort({ createdAt: -1 });

  res.status(200).json({
    status: 200,
    success: true,
    message: "",
    data: { items },
  });
});

//////////////////////////////////////////////////
// ➕ Create Item (Part / Assembly / Main)
//////////////////////////////////////////////////
exports.store = catchAsync(async (req, res, next) => {
  const body = JSON.parse(JSON.stringify(req.body));

  const item = await Item.create(body);

  // ✅ ADD THIS
  if (item.type === "part") {
    const cost =
      (item.costing?.weight || 0) * (item.costing?.rate || 0) +
      (item.costing?.labour || 0);
    console.log("store called, calculated cost:", cost);
    item.costing.latest_cost = cost;
    await item.save();
  }

  res.status(200).json({
    success: true,
    data: { item },
  });
});

//////////////////////////////////////////////////
// ✏️ Update Item
//////////////////////////////////////////////////
exports.update = catchAsync(async (req, res, next) => {
  const body = JSON.parse(JSON.stringify(req.body));

  if ("code" in req.body) {
    body.code = req.body.code || "";
  }

  // 🔥 FIX: handle costing separately
  if (body.costing) {
    const { weight, rate, labour } = body.costing;

    const latest_cost = (weight || 0) * (rate || 0) + (labour || 0);

    body["costing.weight"] = weight;
    body["costing.rate"] = rate;
    body["costing.labour"] = labour;
    body["costing.latest_cost"] = latest_cost;

    delete body.costing; // ❗ important
  }

  const item = await Item.findByIdAndUpdate(
    req.params.id,
    { $set: body },
    { new: true, runValidators: true }
  );

  res.status(200).json({
    success: true,
    data: { item },
  });
});

//////////////////////////////////////////////////
// ❌ Soft Delete Item
//////////////////////////////////////////////////
exports.delete = catchAsync(async (req, res, next) => {
  const filter = req.params.id
    ? { _id: req.params.id }
    : JSON.parse(decodeURIComponent(req.query));

  const result = await Item.updateMany(filter, {
    $set: { is_deleted: true },
  });

  res.status(200).json({
    status: 200,
    success: true,
    message: "Item Deleted Successfully",
    data: { result },
  });
});

exports.addChildren = catchAsync(async (req, res, next) => {
  const { children } = req.body;

  const item = await Item.findByIdAndUpdate(
    req.params.id,
    { $set: { children } },
    { new: true }
  );

  res.status(200).json({
    success: true,
    message: "Children updated successfully",
    data: { item },
  });
});

const getFullBOM = async (itemId) => {
  const item = await Item.findById(itemId).lean();

  if (!item || !item.children.length) return item;

  const children = await Promise.all(
    item.children.map(async (child) => {
      const childData = await getFullBOM(child.item_id);
      return {
        ...child,
        item: childData,
      };
    })
  );

  return {
    ...item,
    children,
  };
};

exports.getBOM = catchAsync(async (req, res, next) => {
  const bom = await getFullBOM(req.params.id);

  res.status(200).json({
    success: true,
    data: { bom },
  });
});

const calculateCost = async (itemId) => {
  const item = await Item.findById(itemId).populate("children.item_id");

  if (!item) return 0;

  // Part → direct cost
  if (item.type === "part") {
    const cost = item.costing.weight * item.costing.rate + item.costing.labour;

    item.costing.latest_cost = cost;
    await item.save();
    return cost;
  }

  // Assembly / Main → sum of children
  let total = 0;

  for (const child of item.children) {
    const childCost = await calculateCost(child.item_id._id);
    total += childCost * child.quantity;
  }

  item.costing.latest_cost = total;
  await item.save();

  return total;
};

exports.recalculateCost = catchAsync(async (req, res) => {
  // 🔥 Step 1: get FULL tree once
  const getFullBOM = async (itemId) => {
    const item = await Item.findById(itemId)
      .populate("children.item_id")
      .lean();

    if (!item || !item.children?.length) return item;

    const children = await Promise.all(
      item.children.map(async (child) => {
        const childData = await getFullBOM(child.item_id._id);

        return {
          ...child,
          item: childData,
        };
      })
    );

    return { ...item, children };
  };

  const root = await getFullBOM(req.params.id);

  // 🔥 Step 2: calculate cost in memory (NO DB CALLS)
  const calculate = (node) => {
    if (!node.children || node.children.length === 0) {
      return (
        (node.costing?.weight || 0) * (node.costing?.rate || 0) +
        (node.costing?.labour || 0)
      );
    }

    let total = 0;

    node.children.forEach((child) => {
      const childCost = calculate(child.item);
      total += childCost * (child.quantity || 0);
    });

    node.costing.latest_cost = total;
    return total;
  };

  calculate(root);

  // 🔥 Step 3: save ONLY ROOT (optional: cascade later)
  await Item.findByIdAndUpdate(req.params.id, {
    "costing.latest_cost": root.costing.latest_cost,
  });

  res.status(200).json({
    success: true,
    data: { cost: root.costing.latest_cost },
  });
});

exports.search = catchAsync(async (req, res, next) => {
  const { type, value } = req.query;

  let query = { is_deleted: false };

  if (type === "name") {
    query.name = { $regex: value, $options: "i" };
  } else if (type === "code") {
    query.code = { $regex: value, $options: "i" };
  }

  const items = await Item.find(query)
    .populate({
      path: "children.item_id",
      select: "name type costing",
    })
    .limit(20);

  res.status(200).json({
    success: true,
    data: { items },
  });
});

exports.searchPO = catchAsync(async (req, res, next) => {
  const search = req.query.search ?? "";
  const type = req.query.type ?? "all";

  const trimmedSearch = String(search).trim();

  if (!trimmedSearch) {
    return res.status(200).json({
      success: true,
      data: { items: [] },
    });
  }

  let query = { is_deleted: false };

  // 🔹 ITEM NAME
  if (type === "name") {
    query.name = { $regex: trimmedSearch, $options: "i" };
  }

  // 🔹 ITEM CODE
  else if (type === "code") {
    query.code = { $regex: trimmedSearch, $options: "i" };
  }

  // 🔹 VENDOR SEARCH
  else if (type === "vendor") {
    const matchingVendors = await Vendor.find({
      $or: [
        { name: { $regex: trimmedSearch, $options: "i" } },
        { code: { $regex: trimmedSearch, $options: "i" } },
        { phone: { $regex: trimmedSearch, $options: "i" } },
      ],
    }).select("_id");

    const vendorIds = matchingVendors.map((v) => v._id);

    if (vendorIds.length === 0) {
      return res.status(200).json({
        success: true,
        data: { items: [] },
      });
    }

    query.vendors = {
      $elemMatch: {
        vendor_id: { $in: vendorIds },
      },
    };
  }

  // 🔹 ALL SEARCH (🔥 powerful)
  else {
    const matchingVendors = await Vendor.find({
      $or: [
        { name: { $regex: trimmedSearch, $options: "i" } },
        { code: { $regex: trimmedSearch, $options: "i" } },
      ],
    }).select("_id");

    const vendorIds = matchingVendors.map((v) => v._id);

    query.$or = [
      { name: { $regex: trimmedSearch, $options: "i" } },
      { code: { $regex: trimmedSearch, $options: "i" } },
      {
        vendors: {
          $elemMatch: {
            vendor_id: { $in: vendorIds },
          },
        },
      },
    ];
  }

  const items = await Item.find(query)
    .populate({
      path: "vendors.vendor_id",
      select: "name phone code",
    })
    .limit(20);

  res.status(200).json({
    success: true,
    data: { items },
  });
});

exports.bulkUpdate = catchAsync(async (req, res, next) => {
  const { ids, updates } = req.body;

  if (!ids || ids.length === 0) {
    return res.status(400).json({
      success: false,
      message: "No item IDs provided",
    });
  }

  const result = await Item.updateMany(
    { _id: { $in: ids } },
    { $set: updates }
  );

  res.status(200).json({
    success: true,
    message: "Bulk update successful",
    data: { result },
  });
});

exports.transaction = async (req, res) => {
  try {
    const { item_id, quantity, type, person_name, note } = req.body;

    if (!item_id || !quantity || !type) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const item = await Item.findById(item_id);

    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    const change = type === "issue" ? -quantity : quantity;

    // 🔴 Prevent negative stock
    if (type === "issue" && item.stock < quantity) {
      return res.status(400).json({
        message: "Insufficient stock",
      });
    }

    // ✅ Update stock
    item.stock += change;
    await item.save();

    // ✅ Save transaction (IMPORTANT)
    await Transaction.create({
      item_id,
      quantity,
      type,
      person_name: person_name?.trim() || null, // 🔥 FIX
      note,
    });

    res.json({ success: true });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getPeople = async (req, res) => {
  console.log("Fetching people from transactions");
  await runAnalyticsForAllItems();

  try {
    const people = await Transaction.distinct("person_name");

    // remove empty/null
    const filtered = people.filter((p) => p && p.trim() !== "");

    res.json({
      success: true,
      data: filtered,
    });
  } catch (err) {
    res.status(500).json({ message: "Error fetching people" });
  }
};

exports.getTransactionsByItem = async (req, res) => {
  try {
    const { item_id } = req.query;

    const transactions = await Transaction.find({ item_id }).sort({
      createdAt: 1,
    }); // 🔥 oldest first

    let runningStock = 0;

    const result = transactions.map((t) => {
      const change = t.type === "issue" ? -t.quantity : t.quantity;

      runningStock += change;

      return {
        ...t.toObject(),
        running_stock: runningStock,
        change,
      };
    });

    // 🔥 send latest first (UI friendly)
    result.reverse();

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    res.status(500).json({ message: "Error fetching transactions" });
  }
};
