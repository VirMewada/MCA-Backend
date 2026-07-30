const Item = require("../Models/itemModel");
const Vendor = require("../Models/vendorModel");
const Transaction = require("../Models/transactionModel");
const catchAsync = require("../Utils/catchAsync");
const { runAnalyticsForAllItems } = require("../cron/analyticsService");
const Category = require("../Models/CategoryModel");
const {
  validateChildren,
  recalculateCostTree,
  unitCostOf,
} = require("../Utils/bom");

//////////////////////////////////////////////////
// 🔍 Find Single Item (with children populated)
//////////////////////////////////////////////////
exports.find = catchAsync(async (req, res, next) => {
  const item = await Item.findOne({
    _id: req.params.id,
    is_deleted: false,
  })
    .populate("children.item_id")
    .populate("category");

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

  // 🔹 TYPE FILTER
  if (req.query.type) {
    const types = req.query.type.split(",").map((t) => t.trim());
    query.type = { $in: types };
  }

  // 🔹 SEARCH FILTER
  if (req.query.search) {
    query.$or = [
      { name: { $regex: req.query.search, $options: "i" } },
      { code: { $regex: req.query.search, $options: "i" } },
    ];
  }

  // 🔥 CATEGORY FILTER (NEW)
  if (req.query.category) {
    const categoryId = req.query.category;

    // 👉 Step 1: Get selected category
    const selectedCategory = await Category.findById(categoryId);

    if (selectedCategory) {
      // 👉 Step 2: Find all matching categories using full_path
      const matchingCategories = await Category.find({
        full_path: {
          $regex: `^${selectedCategory.full_path}`, // starts with path
          $options: "i",
        },
        is_deleted: false,
      }).select("_id");

      const categoryIds = matchingCategories.map((c) => c._id);

      // 👉 Step 3: Apply filter
      query.category = { $in: categoryIds };
    }
  }

  // 🔹 FETCH ITEMS
  const items = await Item.find(query)
    .populate({
      path: "category",
      select: "name full_path level",
    })
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

  const category = await Category.findById(body.category);

  if (!category) {
    return res.status(400).json({
      success: false,
      message: "Invalid category",
    });
  }

  // 🔹 Build derived fields
  body.full_code = `${category.code}/${body.item_number}`;

  body.category_snapshot = {
    full_path: category.full_path,
    code: category.code,
  };

  // Seed latest_cost at creation. Previously this was left at its 0 default
  // until someone edited the item, so a brand-new part with a perfectly good
  // weight/rate/labour still contributed 0 to every BOM that used it.
  if (!body.children?.length) {
    const seeded = unitCostOf({ costing: body.costing, children: [] });
    if (seeded > 0) {
      body.costing = { ...(body.costing || {}), latest_cost: seeded };
    }
  }

  const item = await Item.create(body);

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

  // ❗ BLOCK identity changes
  delete body.category;
  delete body.item_number;
  delete body.full_code;
  delete body.category_snapshot;

  if ("code" in req.body) {
    body.code = req.body.code || "";
  }

  // ❗ Children are never edited through here — that's what
  // PATCH /items/:id/children is for, and it's the only path with cycle and
  // part-type validation. Accepting them here would bypass both.
  delete body.children;

  // Demoting something to "part" only makes sense if it has no components.
  // Otherwise a raw material ends up owning a bill of materials, which is the
  // exact state the BOM validator exists to prevent.
  if (body.type === "part") {
    const existing = await Item.findById(req.params.id)
      .select("children name")
      .lean();

    if (existing?.children?.length) {
      return res.status(400).json({
        success: false,
        message: `"${existing.name}" has ${existing.children.length} component(s), so it can't be changed to a Part. Remove its bill of materials first.`,
      });
    }
  }

  // 🔥 costing logic (keep as is)
  if (body.costing) {
    const { weight, rate, labour } = body.costing;

    const latest_cost = (weight || 0) * (rate || 0) + (labour || 0);

    body["costing.weight"] = weight;
    body["costing.rate"] = rate;
    body["costing.labour"] = labour;
    body["costing.latest_cost"] = latest_cost;

    delete body.costing;
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

  // Validate BEFORE writing. Previously this accepted anything, so an item
  // could be made a descendant of itself and every BOM traversal
  // (getBOM, recalculateCost, buildable) would recurse until the process died.
  const check = await validateChildren(req.params.id, children);

  if (!check.ok) {
    return res.status(400).json({
      success: false,
      message: check.message,
    });
  }

  const item = await Item.findByIdAndUpdate(
    req.params.id,
    { $set: { children: check.children } },
    { new: true, runValidators: true }
    // `costing` is required here — without it the `total` virtual can't be
    // computed and every component renders with a unit cost of 0 until the
    // page is reloaded.
  ).populate("children.item_id", "name full_code type unit stock costing");

  res.status(200).json({
    success: true,
    message: "Children updated successfully",
    data: { item },
  });
});

// Buildable-quantity and build operations live in buildController.js
// (routes: GET /items/:id/buildable, POST /items/:id/build).

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

/**
 * Recalculate this item's cost AND every assembly beneath it.
 *
 * The old version walked the tree with a recursive N+1 fetch (no cycle guard)
 * and then saved ONLY the root — its own comment said "cascade later" — so
 * nested assemblies and leaves kept whatever stale latest_cost they had.
 * See Utils/bom.recalculateCostTree for the replacement.
 */
exports.recalculateCost = catchAsync(async (req, res) => {
  const result = await recalculateCostTree(req.params.id);

  if (result.error) {
    return res.status(404).json({ success: false, message: result.error });
  }

  res.status(200).json({
    success: true,
    data: {
      cost: result.rootCost,
      // Which items actually moved, so the UI can report "updated 7 items"
      // rather than silently changing numbers under the user.
      updated: result.updated,
      cycles: result.cycles,
    },
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

  const items = await Item.find(query).populate({
    path: "children.item_id",
    select: "name type costing",
  });
  // .limit(20);

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

    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      return res
        .status(400)
        .json({ message: "Quantity must be greater than zero" });
    }

    // Single atomic read-modify-write. The old version read item.stock,
    // compared it, then saved — so two concurrent issues could both pass the
    // check and drive stock negative. Guarding on stock inside the filter
    // means the database does the comparison, not us.
    const change = type === "issue" ? -qty : qty;
    const filter =
      type === "issue"
        ? { _id: item_id, stock: { $gte: qty } }
        : { _id: item_id };

    const updated = await Item.findOneAndUpdate(
      filter,
      { $inc: { stock: change } },
      { new: true }
    );

    if (!updated) {
      return res.status(400).json({ message: "Insufficient stock" });
    }

    await Transaction.create({
      item_id,
      quantity: qty,
      type,
      person_name: person_name?.trim() || null,
      note,
      stock_after: updated.stock,
    });

    res.json({ success: true, data: { stock: updated.stock } });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getPeople = async (req, res) => {
  console.log("Fetching people from transactions");
  // await runAnalyticsForAllItems();

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

    // "issue" and "consume" both take stock out; everything else puts it in.
    const OUTBOUND = new Set(["issue", "consume", "unbuild_remove"]);

    const result = transactions.map((t) => {
      const change = OUTBOUND.has(t.type) ? -t.quantity : t.quantity;

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
