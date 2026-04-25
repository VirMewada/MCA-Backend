const PO = require("../Models/POModel");
const catchAsync = require("../Utils/catchAsync");
const Vendor = require("../Models/vendorModel");

exports.create = catchAsync(async (req, res) => {
  const { vendor_id, items, payment_terms, note, expected_delivery_date } =
    req.body;

  if (!vendor_id || !items?.length) {
    return res.status(400).json({
      success: false,
      message: "Vendor and items are required",
    });
  }

  const vendor = await Vendor.findById(vendor_id);

  if (!vendor) {
    return res.status(404).json({
      success: false,
      message: "Vendor not found",
    });
  }

  const round2 = (num) =>
    Math.round((Number(num) + Number.EPSILON) * 100) / 100;

  let total_amount = 0;

  const formattedItems = items.map((i) => {
    if (!i.item_id || i.quantity <= 0 || i.price < 0) {
      throw new Error("Invalid item data");
    }

    const qty = round2(i.quantity);
    const price = round2(i.price);
    const weight = round2(i.weight || 0);

    const rawTotal = weight > 0 ? qty * price * weight : qty * price;

    const total = round2(rawTotal);

    total_amount += total;

    return {
      item_id: i.item_id,
      quantity: qty,

      in_vendor: qty,
      in_house: 0,
      in_machining: 0,
      in_testing: 0,

      received_quantity: 0,

      price,
      total,
      weight,
    };
  });

  total_amount = round2(total_amount);

  const count = await PO.countDocuments();
  const po_number = `PO-${new Date().getFullYear()}-${String(
    count + 1
  ).padStart(4, "0")}`;

  const po = await PO.create({
    vendor_id,
    po_number,
    items: formattedItems,
    total_amount,
    payment_terms,
    note,
    expected_delivery_date,

    status: "created",

    timeline: [
      {
        event: "po_created",
        date: new Date(),
        note: "PO created",
      },
    ],
  });

  res.status(200).json({
    success: true,
    data: { po },
  });
});

exports.index = catchAsync(async (req, res) => {
  const { status } = req.query;

  let query = { is_deleted: false };

  // 🔥 Optional status filter
  if (status && status !== "all") {
    query.status = status;
  }

  const pos = await PO.find(query)
    .populate("vendor_id", "name phone")
    .populate("items.item_id", "name code unit")
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    data: { pos },
  });
});

//single PO
exports.show = catchAsync(async (req, res) => {
  const po = await PO.findById(req.params.id)
    .populate("vendor_id")
    .populate("items.item_id");

  if (!po) {
    return res.status(404).json({
      success: false,
      message: "PO not found",
    });
  }

  res.status(200).json({
    success: true,
    data: { po },
  });
});

exports.update = catchAsync(async (req, res) => {
  const { items, payment_terms, note } = req.body;

  const po = await PO.findById(req.params.id);

  if (!po) {
    return res.status(404).json({
      success: false,
      message: "PO not found",
    });
  }

  let total_amount = 0;

  let formattedItems = po.items;

  if (items?.length) {
    formattedItems = items.map((i) => {
      const total =
        i.weight && i.weight > 0
          ? i.quantity * i.price * i.weight
          : i.quantity * i.price;
      total_amount += total;

      return {
        item_id: i.item_id,
        quantity: i.quantity,
        price: i.price,
        total,
      };
    });
  }

  po.items = formattedItems;
  po.total_amount = total_amount || po.total_amount;
  po.payment_terms = payment_terms ?? po.payment_terms;
  po.note = note ?? po.note;

  await po.save();

  res.status(200).json({
    success: true,
    data: { po },
  });
});

exports.updateStatus = catchAsync(async (req, res) => {
  const { status, event, note, items } = req.body;

  const allowedStatuses = ["created", "in_progress", "completed", "cancelled"];

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Invalid status",
    });
  }

  const po = await PO.findById(req.params.id);

  if (!po) {
    return res.status(404).json({
      success: false,
      message: "PO not found",
    });
  }

  // 🔥 Update status
  po.status = status;

  // ============================
  // 🔥 HANDLE MOVEMENTS (CORE)
  // ============================

  if (event && items?.length) {
    for (const input of items) {
      const { item_id, quantity } = input;

      const item = po.items.find(
        (i) => i._id.toString() === item_id.toString()
      );

      if (!item) {
        return res.status(400).json({
          success: false,
          message: "Invalid item",
        });
      }

      if (!quantity || quantity <= 0) continue;

      // 🔥 SEND TO MACHINING
      if (event === "sent_for_machining") {
        if (quantity > item.in_house) {
          return res.status(400).json({
            success: false,
            message: `Not enough stock in house for ${item.item_id}`,
          });
        }

        item.in_house -= quantity;
        item.in_machining += quantity;
      }

      // 🔥 RECEIVE FROM MACHINING
      if (event === "received_from_machining") {
        if (quantity > item.in_machining) {
          return res.status(400).json({
            success: false,
            message: `Not enough items in machining`,
          });
        }

        item.in_machining -= quantity;
        item.in_house += quantity;
        // item.received_quantity += quantity;
      }

      // 🔥 SEND FOR TESTING (random qty)
      if (event === "sent_for_testing") {
        if (quantity > item.in_house) {
          return res.status(400).json({
            success: false,
            message: `Not enough stock for testing`,
          });
        }

        item.in_house -= quantity;
        item.in_testing += quantity;
      }

      // 🔥 RECEIVE FROM TESTING
      if (event === "received_from_testing") {
        if (quantity > item.in_testing) {
          return res.status(400).json({
            success: false,
            message: `Not enough items in testing`,
          });
        }

        item.in_testing -= quantity;
        item.in_house += quantity;
      }

      // 🔥 DIRECT RECEIVE FROM VENDOR
      if (event === "received") {
        if (quantity > item.in_vendor) {
          return res.status(400).json({
            success: false,
            message: `Not enough items with vendor`,
          });
        }

        item.in_vendor -= quantity;
        item.in_house += quantity;
        item.received_quantity += quantity;
      }
    }

    // 🔥 Add timeline
    po.timeline.push({
      event,
      note: note || "Updated from app",
      date: new Date(),
    });
  }

  // ============================
  // 🔥 CLOSING LOGIC
  // ============================

  if (status === "completed") {
    console.log("Checking if all items received before closing PO", po.items);

    const allReceived = po.items.every(
      (i) => i.received_quantity === i.quantity
    );

    if (!allReceived) {
      return res.status(400).json({
        success: false,
        message: "Cannot complete PO until all items are received",
      });
    }

    po.timeline.push({
      event: "closed",
      note: note || "PO completed",
      date: new Date(),
    });

    po.actual_delivery_date = new Date();

    const diff =
      (po.actual_delivery_date - po.createdAt) / (1000 * 60 * 60 * 24);

    po.lead_time_days = Math.round(diff);
  }

  // ============================
  // 🔥 QC LOGIC
  // ============================

  if (event === "qc_passed") {
    po.is_accepted = true;
  }

  if (event === "qc_failed") {
    po.is_accepted = false;
  }

  await po.save();

  res.status(200).json({
    success: true,
    data: { po },
  });
});

exports.remove = catchAsync(async (req, res) => {
  const po = await PO.findByIdAndUpdate(
    req.params.id,
    { is_deleted: true },
    { new: true }
  );

  if (!po) {
    return res.status(404).json({
      success: false,
      message: "PO not found",
    });
  }

  res.status(200).json({
    success: true,
    message: "PO deleted",
  });
});

exports.addMovement = catchAsync(async (req, res) => {
  const { action, note } = req.body;

  const allowedActions = [
    "received_at_facility",

    "sent_for_machining",
    "received_from_machining",

    "sent_for_testing",
    "received_from_testing",
  ];

  if (!allowedActions.includes(action)) {
    return res.status(400).json({
      success: false,
      message: "Invalid movement action",
    });
  }

  const po = await PO.findById(req.params.id);

  if (!po) {
    return res.status(404).json({
      success: false,
      message: "PO not found",
    });
  }

  // 🔥 Add movement to timeline
  po.timeline.push({
    type: "movement",
    action,
    note,
  });

  await po.save();

  res.status(200).json({
    success: true,
    data: { po },
  });
});

exports.search = catchAsync(async (req, res) => {
  const { search = "", status = "all", type = "all" } = req.query;

  let query = {
    is_deleted: false,
  };

  // 🔥 STATUS FILTER
  if (status !== "all") {
    query.status = status;
  }

  // =========================
  // 🔍 BUILD SEARCH CONDITIONS
  // =========================
  let searchConditions = [];

  if (search.trim()) {
    const regex = new RegExp(search, "i");

    searchConditions = [
      { po_number: regex }, // 🔥 PO number search
    ];
  }

  // =========================
  // 🔍 MAIN QUERY
  // =========================
  // let pos = await PO.find(
  //   searchConditions.length ? { ...query, $or: searchConditions } : query
  // )
  //   .populate("vendor_id", "name phone")
  //   .populate("items.item_id", "name code unit")
  //   .sort({ createdAt: -1 });
  let pos = await PO.find(query)
    .populate("vendor_id", "name phone")
    .populate("items.item_id", "name code unit")
    .sort({ createdAt: -1 });

  // =========================
  // 🔥 ADVANCED FILTERING (post-populate)
  // =========================
  if (search.trim()) {
    const lower = search.toLowerCase();

    pos = pos.filter((po) => {
      const poMatch = po.po_number?.toLowerCase().includes(lower);

      const vendorMatch = po.vendor_id?.name?.toLowerCase().includes(lower);

      const itemMatch = po.items?.some((item) => {
        const name = item.item_id?.name?.toLowerCase() || "";
        const code = item.item_id?.code?.toLowerCase() || "";
        return name.includes(lower) || code.includes(lower);
      });

      if (type === "po") return poMatch;
      if (type === "vendor") return vendorMatch;
      if (type === "item") return itemMatch;

      return poMatch || vendorMatch || itemMatch; // all
    });
  }

  res.status(200).json({
    success: true,
    data: { pos },
  });
});

exports.vendorAnalytics = catchAsync(async (req, res) => {
  const pos = await PO.find({ is_deleted: false }).populate(
    "vendor_id",
    "name"
  );

  const vendorMap = {};

  pos.forEach((po) => {
    const vendorId = po.vendor_id?._id?.toString();
    if (!vendorId) return;

    if (!vendorMap[vendorId]) {
      vendorMap[vendorId] = {
        vendor: po.vendor_id,
        totalPOs: 0,
        completedPOs: 0,
        onTime: 0,
        late: 0,
        qcPassed: 0,
        qcFailed: 0,
        totalLeadTime: 0,
        totalItems: 0,
        receivedItems: 0,
      };
    }

    const v = vendorMap[vendorId];

    v.totalPOs++;

    if (po.status === "completed") {
      v.completedPOs++;

      // 🕒 On-time vs late
      if (
        po.actual_delivery_date &&
        po.expected_delivery_date &&
        po.actual_delivery_date <= po.expected_delivery_date
      ) {
        v.onTime++;
      } else {
        v.late++;
      }

      // ⚡ Lead time
      if (po.lead_time_days) {
        v.totalLeadTime += po.lead_time_days;
      }
    }

    // ✅ QC
    if (po.is_accepted === true) v.qcPassed++;
    if (po.is_accepted === false) v.qcFailed++;

    // 📦 Fulfillment
    po.items.forEach((item) => {
      v.totalItems += item.quantity;
      v.receivedItems += item.received_quantity;
    });
  });

  // 🎯 Final metrics
  const result = Object.values(vendorMap).map((v) => {
    const onTimeRate = v.completedPOs ? (v.onTime / v.completedPOs) * 100 : 0;

    const qcRate = v.totalPOs ? (v.qcPassed / v.totalPOs) * 100 : 0;

    const fulfillmentRate = v.totalItems
      ? (v.receivedItems / v.totalItems) * 100
      : 0;

    const avgLeadTime = v.completedPOs ? v.totalLeadTime / v.completedPOs : 0;

    // 🧠 FINAL SCORE (custom weight)
    const score =
      onTimeRate * 0.3 +
      qcRate * 0.3 +
      fulfillmentRate * 0.2 +
      (100 - avgLeadTime) * 0.2;

    return {
      ...v,
      onTimeRate,
      qcRate,
      fulfillmentRate,
      avgLeadTime,
      score: Math.round(score),
    };
  });

  res.status(200).json({
    success: true,
    data: { vendors: result },
  });
});
