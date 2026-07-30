const PO = require("../Models/POModel");
const catchAsync = require("../Utils/catchAsync");
const Vendor = require("../Models/vendorModel");

const round2 = (num) => Math.round((Number(num) + Number.EPSILON) * 100) / 100;

const generatePoNumber = async () => {
  const count = await PO.countDocuments();
  return `PO-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;
};

// Recomputes total_amount/gst_amount/grand_total from the current state of
// po.items -- used after a write-off changes a line's billable total.
const recomputePOTotals = (po) => {
  const total_amount = round2(
    po.items.reduce((sum, i) => sum + (i.total || 0), 0)
  );
  const gstRate = po.gst_rate ?? 18;
  const gst_amount = round2(total_amount * (gstRate / 100));
  const grand_total = round2(total_amount + gst_amount);
  po.total_amount = total_amount;
  po.gst_amount = gst_amount;
  po.grand_total = grand_total;
};

const finalizeJobPOIfResolved = (po) => {
  if (po.job_type === "material") return; // manual completion only for material POs
  if (po.status === "completed" || po.status === "cancelled") return;

  const allResolved = po.items.every((i) => i.received_quantity === i.quantity);
  if (!allResolved) return;

  po.status = "completed";
  po.actual_delivery_date = new Date();
  const diff = (po.actual_delivery_date - po.createdAt) / (1000 * 60 * 60 * 24);
  po.lead_time_days = Number(diff.toFixed(2));
  po.timeline.push({
    event: "closed",
    note: "Auto-completed: every item resolved (accepted or rejected to origin)",
    date: new Date(),
  });
};

exports.rejectToOrigin = catchAsync(async (req, res) => {
  const { item_id, quantity, note } = req.body;

  const jobPO = await PO.findById(req.params.id);
  if (!jobPO)
    return res.status(404).json({ success: false, message: "PO not found" });

  const jobLine = jobPO.items.find(
    (i) => i._id.toString() === item_id?.toString()
  );
  if (!jobLine)
    return res.status(400).json({ success: false, message: "Invalid item" });

  if (!jobLine.origin_po_id || !jobLine.origin_item_id) {
    return res.status(400).json({
      success: false,
      message:
        "This item has no origin PO to reject back to -- it wasn't created from another PO.",
    });
  }

  if (!quantity || quantity <= 0) {
    return res
      .status(400)
      .json({ success: false, message: "quantity must be > 0" });
  }
  if (quantity > jobLine.in_house) {
    return res.status(400).json({
      success: false,
      message: `Only ${jobLine.in_house} pending QC on this job -- can't reject ${quantity}`,
    });
  }

  const originPO = await PO.findById(jobLine.origin_po_id);
  if (!originPO) {
    return res
      .status(404)
      .json({ success: false, message: "Origin PO no longer exists" });
  }

  const originLine = originPO.items.find(
    (i) => i._id.toString() === jobLine.origin_item_id.toString()
  );
  if (!originLine) {
    return res.status(400).json({
      success: false,
      message: "Origin item no longer exists on the origin PO",
    });
  }
  if (quantity > originLine.received_quantity) {
    return res.status(400).json({
      success: false,
      message: `Only ${originLine.received_quantity} currently marked accepted on the origin PO`,
    });
  }

  // JOB PO: this line's SERVICE is done -- a report was delivered, even
  // though it says the material failed. That's what lets the job PO
  // close on its own, same as if it had passed.
  jobLine.in_house -= quantity;
  jobLine.received_quantity += quantity;

  // ORIGIN PO: walk back the earlier auto-accept -- the actual material
  // goes back to whoever supplied it.
  originLine.received_quantity -= quantity;
  originLine.in_vendor += quantity;

  const wasCompleted = originPO.status === "completed";
  if (wasCompleted) {
    originPO.status = "in_progress";
    originPO.timeline.push({
      event: "reopened",
      note: "Reopened: downstream testing found a defect traced back to this delivery",
      date: new Date(),
    });
  }

  originPO.timeline.push({
    event: "rejected_to_origin",
    item_id: originLine._id,
    quantity,
    note: note || `Rejected after failing downstream QC (${jobPO.po_number})`,
    date: new Date(),
  });

  jobPO.timeline.push({
    event: "rejected_to_origin",
    item_id: jobLine._id,
    quantity,
    note:
      note ||
      `Material failed test -- escalated to original vendor via ${originPO.po_number}`,
    date: new Date(),
  });

  // The job (testing/machining) vendor's service is done for this
  // quantity either way -- close the job PO if everything on it has now
  // resolved.
  finalizeJobPOIfResolved(jobPO);

  await Promise.all([originPO.save(), jobPO.save()]);

  res.status(200).json({
    success: true,
    data: { job_po: jobPO, origin_po: originPO },
  });
});

exports.create = catchAsync(async (req, res) => {
  const {
    vendor_id,
    items,
    payment_terms,
    note,
    expected_delivery_date,
    gst_rate, // NEW -- optional, defaults to 18
  } = req.body;

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
      po_name: i.po_name?.trim() || i.item_name || "",
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

  // NEW -- GST
  const resolvedGstRate =
    gst_rate === undefined || gst_rate === null ? 18 : Number(gst_rate);
  const gst_amount = round2(total_amount * (resolvedGstRate / 100));
  const grand_total = round2(total_amount + gst_amount);

  const count = await PO.countDocuments();
  const po_number = `PO-${new Date().getFullYear()}-${String(
    count + 1
  ).padStart(4, "0")}`;

  const po = await PO.create({
    vendor_id,
    po_number,
    items: formattedItems,
    total_amount,
    gst_rate: resolvedGstRate, // NEW
    gst_amount, // NEW
    grand_total, // NEW
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

/////////////////////////////////////////////////
// Show a single PO -- UPDATED to also populate each item's origin PO (for
// job POs) and to attach any child jobs spun off FROM this PO.
//////////////////////////////////////////////////
exports.show = catchAsync(async (req, res) => {
  const po = await PO.findById(req.params.id)
    .populate("vendor_id")
    .populate("items.item_id")
    .populate("items.origin_po_id", "po_number vendor_id job_type status");

  if (!po) {
    return res.status(404).json({
      success: false,
      message: "PO not found",
    });
  }

  // Any PO whose items reference this one as their origin is a "job"
  // spun off from it (machining/testing).
  const childJobs = await PO.find({ "items.origin_po_id": po._id })
    .select(
      "po_number vendor_id job_type status items total_amount grand_total createdAt"
    )
    .populate("vendor_id", "name");

  res.status(200).json({
    success: true,
    data: { po, child_jobs: childJobs },
  });
});

exports.update = catchAsync(async (req, res) => {
  const { items, payment_terms, note, gst_rate } = req.body; // NEW: gst_rate

  const po = await PO.findById(req.params.id);

  if (!po) {
    return res.status(404).json({
      success: false,
      message: "PO not found",
    });
  }

  const round2 = (num) =>
    Math.round((Number(num) + Number.EPSILON) * 100) / 100;

  let total_amount = 0;

  let formattedItems = po.items;

  if (items?.length) {
    formattedItems = items.map((i) => {
      const existing = po.items.find(
        (p) => p.item_id.toString() === i.item_id.toString()
      );

      const total =
        i.weight && i.weight > 0
          ? i.quantity * i.price * i.weight
          : i.quantity * i.price;

      total_amount += total;

      return {
        item_id: i.item_id,

        // keep po_name
        po_name: i.po_name || existing?.po_name || "",

        quantity: i.quantity,
        price: i.price,
        total,

        // PRESERVE tracking fields
        in_vendor: existing?.in_vendor || 0,
        in_house: existing?.in_house || 0,
        in_machining: existing?.in_machining || 0,
        in_testing: existing?.in_testing || 0,
        received_quantity: existing?.received_quantity || 0,

        weight: i.weight ?? existing?.weight ?? 0,
      };
    });
  }

  po.items = formattedItems;
  po.total_amount = total_amount || po.total_amount;
  po.payment_terms = payment_terms ?? po.payment_terms;
  po.note = note ?? po.note;

  // NEW -- recompute GST whenever total_amount or gst_rate could have changed
  if (gst_rate !== undefined) po.gst_rate = Number(gst_rate);
  const effectiveGstRate = po.gst_rate ?? 18;
  po.gst_amount = round2(po.total_amount * (effectiveGstRate / 100));
  po.grand_total = round2(po.total_amount + po.gst_amount);

  await po.save();

  res.status(200).json({
    success: true,
    data: { po },
  });
});

// poController.js -- exports.updateStatus, reworked so:
//  1. "received" (vendor -> house) no longer bumps received_quantity --
//     arriving physically just means "pending QC" now.
//  2. QC becomes two proper per-item, quantity-based movements instead of
//     a single PO-wide is_accepted boolean:
//       - qc_passed: in_house -> received_quantity (this is what now counts
//         as "truly received" for the completion gate)
//       - qc_failed: in_house -> in_vendor (returned to vendor for
//         rework/replacement -- it re-enters the same pool as
//         never-yet-received stock, since from a tracking point of view
//         "vendor owes us this quantity" is true either way)
//  3. The old blanket `po.is_accepted = true/false` block is removed --
//     that field is no longer written or read anywhere. Left on the schema
//     untouched in case you still want it for something else later, but
//     nothing depends on it now.

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

  po.status = status;

  // ============================
  // HANDLE MOVEMENTS (CORE)
  // ============================

  let totalMovedQty = 0;

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

      // SEND TO MACHINING
      if (event === "sent_for_machining") {
        if (quantity > item.in_house) {
          return res.status(400).json({
            success: false,
            message: `Not enough stock in house for ${
              item.po_name || item.item_id
            }`,
          });
        }
        item.in_house -= quantity;
        item.in_machining += quantity;
      }

      // RECEIVE FROM MACHINING
      if (event === "received_from_machining") {
        if (quantity > item.in_machining) {
          return res.status(400).json({
            success: false,
            message: `Not enough items in machining`,
          });
        }
        item.in_machining -= quantity;
        item.in_house += quantity;
      }

      // SEND FOR TESTING
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

      // RECEIVE FROM TESTING
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

      // DIRECT RECEIVE FROM VENDOR -- no longer touches received_quantity.
      // Arriving at the factory means "pending QC," not "done."
      if (event === "received") {
        if (quantity > item.in_vendor) {
          return res.status(400).json({
            success: false,
            message: `Not enough items with vendor`,
          });
        }
        item.in_vendor -= quantity;
        item.in_house += quantity;
      }

      // QC PASS -- the real "received" moment. Only this counts toward the
      // completion gate below.
      if (event === "qc_passed") {
        if (quantity > item.in_house) {
          return res.status(400).json({
            success: false,
            message: `Not enough items pending QC for ${
              item.po_name || item.item_id
            }`,
          });
        }
        item.in_house -= quantity;
        item.received_quantity += quantity;
      }

      // QC FAIL -- sent back to the vendor. Re-enters in_vendor so it flows
      // back through "received" again once a replacement arrives.
      if (event === "qc_failed") {
        if (quantity > item.in_house) {
          return res.status(400).json({
            success: false,
            message: `Not enough items pending QC for ${
              item.po_name || item.item_id
            }`,
          });
        }
        item.in_house -= quantity;
        item.in_vendor += quantity;
      }

      totalMovedQty += quantity;
    }

    po.timeline.push({
      event,
      quantity: totalMovedQty,
      note: note || "Updated from app",
      date: new Date(),
    });
  }

  finalizeJobPOIfResolved(po);
  // ============================
  // CLOSING LOGIC
  // ============================

  if (status === "completed") {
    const allReceived = po.items.every(
      (i) => i.received_quantity === i.quantity
    );

    if (!allReceived) {
      return res.status(400).json({
        success: false,
        message: "Cannot complete PO until all items have passed QC",
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

    po.lead_time_days = Number(diff.toFixed(2));
  }

  // NOTE: the old `is_accepted` true/false block that lived here has been
  // removed -- QC is now the per-item qc_passed/qc_failed movements above,
  // not a single PO-wide flag.

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

      let leadTime = null;

      // 🔥 ALWAYS calculate from timestamps (SOURCE OF TRUTH)
      if (po.actual_delivery_date && po.createdAt) {
        leadTime =
          (po.actual_delivery_date - po.createdAt) / (1000 * 60 * 60 * 24);
      }

      // 🔥 Track lead time properly
      if (leadTime !== null) {
        v.totalLeadTime += leadTime;
        v.leadTimeCount = (v.leadTimeCount || 0) + 1;
      }

      // 🕒 On-time logic
      if (leadTime !== null) {
        if (po.expected_delivery_date) {
          if (po.actual_delivery_date <= po.expected_delivery_date) v.onTime++;
          else v.late++;
        } else {
          // fallback rule (temporary)
          if (leadTime <= 1) v.onTime++;
          else v.late++;
        }
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

    // const qcRate = v.totalPOs ? (v.qcPassed / v.totalPOs) * 100 : 0;
    const qcTotal = v.qcPassed + v.qcFailed;
    const qcRate = qcTotal ? (v.qcPassed / qcTotal) * 100 : 0;

    const fulfillmentRate = v.totalItems
      ? (v.receivedItems / v.totalItems) * 100
      : 0;

    const avgLeadTime = v.leadTimeCount ? v.totalLeadTime / v.leadTimeCount : 0;

    const leadScore = avgLeadTime ? Math.max(0, 100 - avgLeadTime * 10) : 100;

    // 🧠 FINAL SCORE (custom weight)
    const score =
      onTimeRate * 0.3 + qcRate * 0.3 + fulfillmentRate * 0.2 + leadScore * 0.2;

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

////////////////////////////////////////////////
// Send items to a machining/testing job -- this is the core of the
// multi-vendor system. It:
//   1. Moves the sent quantity out of in_house on the ORIGIN PO into the
//      relevant physical-location bucket (in_machining/in_testing).
//   2. Auto-accepts that quantity (received_quantity += quantity) on the
//      ORIGIN PO -- sending it onward is the proof the original material
//      was good, matching the requested behaviour.
//   3. Creates a brand new, fully independent PO to the job vendor
//      (machining shop / testing lab), with its own GST/pricing/status
//      lifecycle, whose items reference back to exactly which origin PO
//      line they came from.
//////////////////////////////////////////////////
exports.sendToJob = catchAsync(async (req, res) => {
  const {
    event, // "sent_for_machining" | "sent_for_testing"
    job_vendor_id,
    gst_rate,
    payment_terms,
    expected_delivery_date,
    note,
    items, // [{ item_id (ORIGIN PO's own line _id), quantity, price, weight }]
  } = req.body;

  if (!["sent_for_machining", "sent_for_testing"].includes(event)) {
    return res.status(400).json({
      success: false,
      message: "event must be sent_for_machining or sent_for_testing",
    });
  }
  if (!job_vendor_id || !items?.length) {
    return res.status(400).json({
      success: false,
      message: "job_vendor_id and items are required",
    });
  }

  const jobVendor = await Vendor.findById(job_vendor_id);
  if (!jobVendor) {
    return res
      .status(404)
      .json({ success: false, message: "Job vendor not found" });
  }

  const originPO = await PO.findById(req.params.id);
  if (!originPO) {
    return res
      .status(404)
      .json({ success: false, message: "Origin PO not found" });
  }

  const bucketField =
    event === "sent_for_machining" ? "in_machining" : "in_testing";
  const jobType = event === "sent_for_machining" ? "machining" : "testing";

  const jobItemsRaw = [];
  let totalMoved = 0;

  for (const input of items) {
    const { item_id, quantity, price, weight } = input;
    const originLine = originPO.items.find(
      (i) => i._id.toString() === item_id?.toString()
    );

    if (!originLine) {
      return res.status(400).json({ success: false, message: "Invalid item" });
    }
    if (!quantity || quantity <= 0) continue;
    if (quantity > originLine.in_house) {
      return res.status(400).json({
        success: false,
        message: `Not enough stock in house for ${
          originLine.po_name || originLine.item_id
        }`,
      });
    }
    if (price === undefined || price === null || price < 0) {
      return res.status(400).json({
        success: false,
        message: "A valid price is required for every item sent to a job",
      });
    }

    // ORIGIN PO: leave in_house, land in the physical-location bucket,
    // AND auto-accept -- sending onward proves the material was good.
    originLine.in_house -= quantity;
    originLine[bucketField] += quantity;
    originLine.received_quantity += quantity;

    totalMoved += quantity;

    jobItemsRaw.push({
      item_id: originLine.item_id, // the master Item ref, carried over
      po_name: originLine.po_name,
      quantity: round2(quantity),
      price: round2(price),
      weight: round2(weight || 0),
      origin_po_id: originPO._id,
      origin_item_id: originLine._id,
    });
  }

  if (jobItemsRaw.length === 0) {
    return res
      .status(400)
      .json({ success: false, message: "No valid items to send" });
  }

  // Build the new job PO exactly like a normal PO (own totals/GST/status)
  let total_amount = 0;
  const formattedItems = jobItemsRaw.map((i) => {
    const rawTotal =
      i.weight > 0 ? i.quantity * i.price * i.weight : i.quantity * i.price;
    const total = round2(rawTotal);
    total_amount += total;
    return {
      ...i,
      total,
      in_vendor: i.quantity, // starts entirely with the job vendor
      in_house: 0,
      in_machining: 0,
      in_testing: 0,
      received_quantity: 0,
    };
  });
  total_amount = round2(total_amount);

  const resolvedGstRate =
    gst_rate === undefined || gst_rate === null ? 18 : Number(gst_rate);
  const gst_amount = round2(total_amount * (resolvedGstRate / 100));
  const grand_total = round2(total_amount + gst_amount);

  const po_number = await generatePoNumber();

  const jobPO = await PO.create({
    vendor_id: job_vendor_id,
    po_number,
    job_type: jobType,
    items: formattedItems,
    total_amount,
    gst_rate: resolvedGstRate,
    gst_amount,
    grand_total,
    payment_terms,
    note,
    expected_delivery_date,
    status: "created",
    timeline: [
      {
        event: "po_created",
        date: new Date(),
        note: `Created from ${originPO.po_number}`,
      },
    ],
  });

  originPO.timeline.push({
    event: "job_created",
    quantity: totalMoved,
    note:
      note ||
      `Sent ${totalMoved} unit(s) to ${jobVendor.name} (${jobPO.po_number})`,
    date: new Date(),
  });

  await originPO.save();

  res.status(200).json({
    success: true,
    data: { origin_po: originPO, job_po: jobPO },
  });
});

/////////////////////////////////////////////////
// Write off a quantity you're not taking back from the vendor. Optionally
// also shrinks what you owe them for it (adjust_billing).
//////////////////////////////////////////////////
exports.writeOffItem = catchAsync(async (req, res) => {
  const { item_id, quantity, adjust_billing, note } = req.body;

  const po = await PO.findById(req.params.id);
  if (!po)
    return res.status(404).json({ success: false, message: "PO not found" });

  const line = po.items.find((i) => i._id.toString() === item_id?.toString());
  if (!line)
    return res.status(400).json({ success: false, message: "Invalid item" });

  if (!quantity || quantity <= 0) {
    return res
      .status(400)
      .json({ success: false, message: "quantity must be > 0" });
  }
  if (quantity > line.in_vendor) {
    return res.status(400).json({
      success: false,
      message: `Only ${line.in_vendor} currently owed by the vendor -- can't write off ${quantity}`,
    });
  }

  line.in_vendor -= quantity;
  line.written_off_quantity = (line.written_off_quantity || 0) + quantity;

  if (adjust_billing) {
    line.billing_adjusted_quantity =
      (line.billing_adjusted_quantity || 0) + quantity;

    const billableQty = line.quantity - line.billing_adjusted_quantity;
    const rawTotal =
      line.weight > 0
        ? billableQty * line.price * line.weight
        : billableQty * line.price;
    line.total = round2(rawTotal);
  }

  recomputePOTotals(po);

  po.timeline.push({
    event: "write_off",
    item_id: line._id,
    quantity,
    note:
      note ||
      (adjust_billing
        ? "Written off and billing adjusted"
        : "Written off (billing unchanged)"),
    date: new Date(),
  });

  await po.save();

  res.status(200).json({ success: true, data: { po } });
});

//////////////////////////////////////////////////
// Reject a quantity back to the ORIGINAL material vendor -- for when a
// downstream job (typically testing) reveals the original delivery was
// actually bad. Only usable on a job PO's line that has an origin PO.
//////////////////////////////////////////////////
exports.rejectToOrigin = catchAsync(async (req, res) => {
  const { item_id, quantity, note } = req.body;

  const jobPO = await PO.findById(req.params.id);
  if (!jobPO)
    return res.status(404).json({ success: false, message: "PO not found" });

  const jobLine = jobPO.items.find(
    (i) => i._id.toString() === item_id?.toString()
  );
  if (!jobLine)
    return res.status(400).json({ success: false, message: "Invalid item" });

  if (!jobLine.origin_po_id || !jobLine.origin_item_id) {
    return res.status(400).json({
      success: false,
      message:
        "This item has no origin PO to reject back to -- it wasn't created from another PO.",
    });
  }

  if (!quantity || quantity <= 0) {
    return res
      .status(400)
      .json({ success: false, message: "quantity must be > 0" });
  }
  if (quantity > jobLine.in_house) {
    return res.status(400).json({
      success: false,
      message: `Only ${jobLine.in_house} pending QC on this job -- can't reject ${quantity}`,
    });
  }

  const originPO = await PO.findById(jobLine.origin_po_id);
  if (!originPO) {
    return res
      .status(404)
      .json({ success: false, message: "Origin PO no longer exists" });
  }

  const originLine = originPO.items.find(
    (i) => i._id.toString() === jobLine.origin_item_id.toString()
  );
  if (!originLine) {
    return res.status(400).json({
      success: false,
      message: "Origin item no longer exists on the origin PO",
    });
  }
  if (quantity > originLine.received_quantity) {
    return res.status(400).json({
      success: false,
      message: `Only ${originLine.received_quantity} currently marked accepted on the origin PO`,
    });
  }

  // JOB PO: this line's SERVICE is done -- a report was delivered, even
  // though it says the material failed. That's what lets the job PO
  // close on its own, same as if it had passed.
  jobLine.in_house -= quantity;
  jobLine.received_quantity += quantity;

  // ORIGIN PO: walk back the earlier auto-accept -- the actual material
  // goes back to whoever supplied it.
  originLine.received_quantity -= quantity;
  originLine.in_vendor += quantity;

  const wasCompleted = originPO.status === "completed";
  if (wasCompleted) {
    originPO.status = "in_progress";
    originPO.timeline.push({
      event: "reopened",
      note: "Reopened: downstream testing found a defect traced back to this delivery",
      date: new Date(),
    });
  }

  originPO.timeline.push({
    event: "rejected_to_origin",
    item_id: originLine._id,
    quantity,
    note: note || `Rejected after failing downstream QC (${jobPO.po_number})`,
    date: new Date(),
  });

  jobPO.timeline.push({
    event: "rejected_to_origin",
    item_id: jobLine._id,
    quantity,
    note:
      note ||
      `Material failed test -- escalated to original vendor via ${originPO.po_number}`,
    date: new Date(),
  });

  // The job (testing/machining) vendor's service is done for this
  // quantity either way -- close the job PO if everything on it has now
  // resolved.
  finalizeJobPOIfResolved(jobPO);

  await Promise.all([originPO.save(), jobPO.save()]);

  res.status(200).json({
    success: true,
    data: { job_po: jobPO, origin_po: originPO },
  });
});
