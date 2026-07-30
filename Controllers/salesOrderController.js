const mongoose = require("mongoose");
const SalesOrder = require("../Models/salesOrderModel");
const Party = require("../Models/partyModel");
const Item = require("../Models/itemModel");
const Transaction = require("../Models/transactionModel");
const catchAsync = require("../Utils/catchAsync");
const { computeOrderFeasibility, unitCostOf } = require("../Utils/bom");

/**
 * Customer orders.
 *
 * Orders are DEMAND. Nothing here moves stock until a dispatch is recorded —
 * at that point the dispatched quantity is issued from finished-goods stock,
 * because otherwise finished stock would only ever grow as things are built
 * and never come down when they ship.
 */

/* ------------------------------------------------------------------ */
/* Status rules                                                        */
/* ------------------------------------------------------------------ */

// What each status is allowed to become. Encoded as data so the API and the UI
// can't drift apart about what's legal.
const TRANSITIONS = {
  draft: ["confirmed", "cancelled"],
  confirmed: ["in_production", "partially_dispatched", "dispatched", "cancelled"],
  in_production: ["partially_dispatched", "dispatched", "cancelled"],
  partially_dispatched: ["dispatched", "cancelled"],
  dispatched: ["closed", "partially_dispatched"],
  closed: [],
  cancelled: [],
};

const EDITABLE = new Set(["draft", "confirmed"]);

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * SO-<year>-<sequence>. Sequence is scoped to the calendar year and derived
 * from the highest existing number rather than a document count, so deleting
 * an order can't cause a collision.
 */
async function nextSoNumber() {
  const year = new Date().getFullYear();
  const prefix = `SO-${year}-`;

  const last = await SalesOrder.findOne({ so_number: new RegExp(`^${prefix}`) })
    .sort({ so_number: -1 })
    .select("so_number")
    .lean();

  const lastSeq = last ? Number(String(last.so_number).slice(prefix.length)) : 0;
  const seq = (Number.isFinite(lastSeq) ? lastSeq : 0) + 1;

  return `${prefix}${String(seq).padStart(4, "0")}`;
}

/** Recompute money from the lines so the client can't send inconsistent totals. */
function recalcTotals(order) {
  const subtotal = (order.items || []).reduce(
    (sum, l) => sum + (Number(l.price) || 0) * (Number(l.quantity) || 0),
    0
  );

  const rate = Number(order.gst_rate) || 0;
  const gst = (subtotal * rate) / 100;

  order.total_amount = Number(subtotal.toFixed(2));
  order.gst_amount = Number(gst.toFixed(2));
  order.grand_total = Number((subtotal + gst).toFixed(2));
}

/**
 * Validate and normalise incoming order lines.
 *
 * The rule the user asked for: only finished products can be ordered. That's
 * `type: "main"` — a customer buys a 2HP pump, not a stator shaft.
 */
async function normaliseLines(rawLines) {
  if (!Array.isArray(rawLines) || !rawLines.length) {
    return { ok: false, message: "An order needs at least one item." };
  }

  const ids = [];
  for (const l of rawLines) {
    const id = String(l?.item_id?._id ?? l?.item_id ?? "");
    if (!mongoose.isValidObjectId(id)) {
      return { ok: false, message: "Every order line needs a valid item." };
    }
    if (ids.includes(id)) {
      return {
        ok: false,
        message:
          "The same product appears on two lines. Combine them into one line.",
      };
    }
    ids.push(id);
  }

  const items = await Item.find({ _id: { $in: ids }, is_deleted: false })
    .select("name full_code unit type costing children")
    .lean();

  const byId = new Map(items.map((i) => [String(i._id), i]));

  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) {
    return {
      ok: false,
      message: "Some products on this order no longer exist.",
    };
  }

  const notMain = items.filter((i) => i.type !== "main");
  if (notMain.length) {
    return {
      ok: false,
      message: `Only finished products can be sold. ${notMain
        .map((i) => `"${i.name}"`)
        .join(", ")} ${notMain.length === 1 ? "is" : "are"} not a Main item.`,
    };
  }

  const lines = rawLines.map((l) => {
    const id = String(l.item_id?._id ?? l.item_id);
    const item = byId.get(id);

    const quantity = Number(l.quantity) || 0;
    // Fall back to the item's rolled-up cost when no price is quoted, so the
    // order total isn't silently zero.
    const price =
      l.price === "" || l.price === undefined || l.price === null
        ? unitCostOf(item)
        : Number(l.price) || 0;

    return {
      item_id: id,
      name: item.name,
      full_code: item.full_code,
      unit: item.unit,
      quantity,
      dispatched_quantity: Number(l.dispatched_quantity) || 0,
      price,
      total: Number((price * quantity).toFixed(2)),
      note: l.note ?? "",
    };
  });

  const bad = lines.find((l) => !(l.quantity > 0));
  if (bad) {
    return {
      ok: false,
      message: `"${bad.name}" needs a quantity greater than zero.`,
    };
  }

  return { ok: true, lines };
}

/* ------------------------------------------------------------------ */
/* CRUD                                                                */
/* ------------------------------------------------------------------ */

exports.index = catchAsync(async (req, res) => {
  const query = { is_deleted: false };

  if (req.query.status) query.status = { $in: req.query.status.split(",") };
  if (req.query.party_id) query.party_id = req.query.party_id;

  const limit = Math.min(Number(req.query.limit) || 100, 300);
  const page = Math.max(Number(req.query.page) || 1, 1);

  let orders = await SalesOrder.find(query)
    .populate("party_id", "name code phone city")
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  // Free-text search runs after population so it can match the party name.
  if (req.query.search?.trim()) {
    const term = req.query.search.trim().toLowerCase();
    orders = orders.filter(
      (o) =>
        o.so_number?.toLowerCase().includes(term) ||
        o.party_id?.name?.toLowerCase().includes(term) ||
        o.party_reference?.toLowerCase().includes(term) ||
        o.items?.some((i) => i.name?.toLowerCase().includes(term))
    );
  }

  res.status(200).json({
    success: true,
    data: { orders, page, limit },
  });
});

exports.find = catchAsync(async (req, res) => {
  const order = await SalesOrder.findOne({
    _id: req.params.id,
    is_deleted: false,
  })
    .populate("party_id")
    .populate("items.item_id", "name full_code type unit stock costing children")
    .lean();

  if (!order) {
    return res
      .status(404)
      .json({ success: false, message: "Order not found." });
  }

  res.status(200).json({ success: true, data: { order } });
});

exports.store = catchAsync(async (req, res) => {
  const { party_id, items, gst_rate, ...rest } = req.body;

  if (!mongoose.isValidObjectId(party_id)) {
    return res
      .status(400)
      .json({ success: false, message: "Select a party for this order." });
  }

  const party = await Party.findOne({ _id: party_id, is_deleted: false }).lean();
  if (!party) {
    return res
      .status(400)
      .json({ success: false, message: "That party doesn't exist." });
  }

  const check = await normaliseLines(items);
  if (!check.ok) {
    return res.status(400).json({ success: false, message: check.message });
  }

  const order = new SalesOrder({
    ...rest,
    party_id,
    items: check.lines,
    gst_rate: gst_rate ?? 18,
    payment_terms: rest.payment_terms || party.payment_terms || "",
    status: rest.status === "confirmed" ? "confirmed" : "draft",
    timeline: [
      {
        event: "created",
        note: `Order raised for ${party.name}`,
        person_name: rest.person_name,
      },
    ],
  });

  recalcTotals(order);

  // so_number is unique; a concurrent create can lose the race, so retry.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      order.so_number = await nextSoNumber();
      await order.save();
      break;
    } catch (err) {
      if (err?.code === 11000 && attempt < 4) continue;
      throw err;
    }
  }

  res.status(201).json({ success: true, data: { order } });
});

exports.update = catchAsync(async (req, res) => {
  const order = await SalesOrder.findOne({
    _id: req.params.id,
    is_deleted: false,
  });

  if (!order) {
    return res
      .status(404)
      .json({ success: false, message: "Order not found." });
  }

  if (!EDITABLE.has(order.status)) {
    return res.status(400).json({
      success: false,
      message: `A ${order.status.replace(
        /_/g,
        " "
      )} order can't be edited. Cancel it and raise a new one instead.`,
    });
  }

  const { items, party_id, ...rest } = req.body;

  if (items) {
    const check = await normaliseLines(items);
    if (!check.ok) {
      return res.status(400).json({ success: false, message: check.message });
    }

    // Preserve anything already dispatched against a line that survives.
    const dispatchedById = new Map(
      order.items.map((l) => [String(l.item_id), l.dispatched_quantity || 0])
    );

    order.items = check.lines.map((l) => ({
      ...l,
      dispatched_quantity: dispatchedById.get(String(l.item_id)) ?? 0,
    }));
  }

  if (party_id && mongoose.isValidObjectId(party_id)) order.party_id = party_id;

  [
    "party_reference",
    "expected_dispatch_date",
    "order_date",
    "payment_terms",
    "note",
    "gst_rate",
  ].forEach((k) => {
    if (k in rest) order[k] = rest[k];
  });

  recalcTotals(order);
  order.timeline.push({ event: "edited", person_name: rest.person_name });

  await order.save();

  res.status(200).json({ success: true, data: { order } });
});

exports.remove = catchAsync(async (req, res) => {
  const order = await SalesOrder.findOne({
    _id: req.params.id,
    is_deleted: false,
  }).lean();

  if (!order) {
    return res
      .status(404)
      .json({ success: false, message: "Order not found." });
  }

  const shipped = (order.items || []).some((l) => (l.dispatched_quantity || 0) > 0);
  if (shipped) {
    return res.status(400).json({
      success: false,
      message:
        "Part of this order has already been dispatched, so it can't be deleted. Cancel it instead to keep the record.",
    });
  }

  await SalesOrder.updateOne(
    { _id: req.params.id },
    { $set: { is_deleted: true } }
  );

  res.status(200).json({ success: true, message: "Order deleted." });
});

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */

exports.updateStatus = catchAsync(async (req, res) => {
  const { status, note, person_name } = req.body;

  const order = await SalesOrder.findOne({
    _id: req.params.id,
    is_deleted: false,
  });

  if (!order) {
    return res
      .status(404)
      .json({ success: false, message: "Order not found." });
  }

  const allowed = TRANSITIONS[order.status] || [];
  if (!allowed.includes(status)) {
    return res.status(400).json({
      success: false,
      message: `Can't go from "${order.status.replace(
        /_/g,
        " "
      )}" to "${String(status).replace(/_/g, " ")}".`,
      data: { allowed },
    });
  }

  const EVENT = {
    confirmed: "confirmed",
    in_production: "production_started",
    dispatched: "dispatched",
    closed: "closed",
    cancelled: "cancelled",
    partially_dispatched: "dispatched",
  };

  const from = order.status;
  order.status = status;
  order.timeline.push({
    event: EVENT[status] ?? "edited",
    from,
    to: status,
    note,
    person_name,
  });

  await order.save();

  res.status(200).json({ success: true, data: { order } });
});

/* ------------------------------------------------------------------ */
/* Dispatch                                                            */
/* ------------------------------------------------------------------ */

/**
 * POST /sales-orders/:id/dispatch
 * body: { lines: [{ line_id, quantity }], note?, person_name? }
 *
 * Records a (possibly partial) dispatch and issues the finished goods from
 * stock. All-or-nothing: if any line is short, nothing moves.
 */
exports.dispatch = catchAsync(async (req, res) => {
  const { lines, note, person_name } = req.body;

  if (!Array.isArray(lines) || !lines.length) {
    return res
      .status(400)
      .json({ success: false, message: "Nothing to dispatch." });
  }

  const order = await SalesOrder.findOne({
    _id: req.params.id,
    is_deleted: false,
  });

  if (!order) {
    return res
      .status(404)
      .json({ success: false, message: "Order not found." });
  }

  if (["cancelled", "closed", "draft"].includes(order.status)) {
    return res.status(400).json({
      success: false,
      message:
        order.status === "draft"
          ? "Confirm the order before dispatching against it."
          : `A ${order.status} order can't be dispatched.`,
    });
  }

  // Resolve requested quantities against the order's own lines.
  const planned = [];
  for (const req_ of lines) {
    const line = order.items.id(req_.line_id);
    if (!line) {
      return res
        .status(400)
        .json({ success: false, message: "Unknown order line." });
    }

    const qty = Number(req_.quantity) || 0;
    if (qty <= 0) continue;

    const remaining = (line.quantity || 0) - (line.dispatched_quantity || 0);
    if (qty > remaining) {
      return res.status(400).json({
        success: false,
        message: `"${line.name}": only ${remaining} left to dispatch on this order.`,
      });
    }

    planned.push({ line, qty });
  }

  if (!planned.length) {
    return res
      .status(400)
      .json({ success: false, message: "Nothing to dispatch." });
  }

  // Check finished-goods stock for every line before touching any of it, so
  // shortages come back in one go.
  const itemIds = planned.map((p) => String(p.line.item_id));
  const stockDocs = await Item.find({ _id: { $in: itemIds } })
    .select("name stock unit")
    .lean();
  const stockById = new Map(stockDocs.map((i) => [String(i._id), i]));

  const short = planned
    .map((p) => {
      const item = stockById.get(String(p.line.item_id));
      const have = Number(item?.stock) || 0;
      return have < p.qty
        ? { name: p.line.name, need: p.qty, have, shortfall: p.qty - have }
        : null;
    })
    .filter(Boolean);

  if (short.length) {
    return res.status(400).json({
      success: false,
      message: `Not enough finished stock to dispatch. Short on ${short
        .map((s) => s.name)
        .join(", ")}.`,
      data: { shortages: short },
    });
  }

  const applied = [];

  try {
    for (const p of planned) {
      // Stock guard lives in the filter so a concurrent issue can't drive
      // finished goods negative.
      const updated = await Item.findOneAndUpdate(
        { _id: p.line.item_id, stock: { $gte: p.qty } },
        { $inc: { stock: -p.qty } },
        { new: true }
      );

      if (!updated) {
        throw Object.assign(
          new Error(
            `Stock for "${p.line.name}" changed while dispatching. Nothing was applied — please retry.`
          ),
          { statusCode: 409 }
        );
      }

      applied.push(p);

      await Transaction.create({
        item_id: p.line.item_id,
        type: "issue",
        quantity: p.qty,
        person_name: person_name?.trim() || null,
        note: `Dispatched against ${order.so_number}`,
        stock_after: updated.stock,
      });

      p.line.dispatched_quantity = (p.line.dispatched_quantity || 0) + p.qty;
    }
  } catch (err) {
    // Put back whatever we already took.
    for (const p of applied) {
      await Item.updateOne(
        { _id: p.line.item_id },
        { $inc: { stock: p.qty } }
      ).catch(() => {});
    }
    throw err;
  }

  const complete = order.items.every(
    (l) => (l.dispatched_quantity || 0) >= (l.quantity || 0)
  );

  const from = order.status;
  order.status = complete ? "dispatched" : "partially_dispatched";

  order.timeline.push({
    event: "dispatched",
    from,
    to: order.status,
    quantity: planned.reduce((s, p) => s + p.qty, 0),
    note,
    person_name,
  });

  await order.save();

  res.status(200).json({
    success: true,
    message: complete
      ? "Order fully dispatched."
      : "Partial dispatch recorded.",
    data: { order },
  });
});

/* ------------------------------------------------------------------ */
/* Feasibility                                                         */
/* ------------------------------------------------------------------ */

/** GET /sales-orders/:id/feasibility — can we actually fulfil this? */
exports.feasibility = catchAsync(async (req, res) => {
  const order = await SalesOrder.findOne({
    _id: req.params.id,
    is_deleted: false,
  })
    .select("items")
    .lean();

  if (!order) {
    return res
      .status(404)
      .json({ success: false, message: "Order not found." });
  }

  const result = await computeOrderFeasibility(order.items || []);

  res.status(200).json({ success: true, data: result });
});

/**
 * POST /sales-orders/feasibility — same check for an order that doesn't exist
 * yet, so the create form can show it live.
 * body: { items: [{ item_id, quantity }] }
 */
exports.previewFeasibility = catchAsync(async (req, res) => {
  const items = (req.body?.items || []).filter((l) =>
    mongoose.isValidObjectId(String(l?.item_id?._id ?? l?.item_id ?? ""))
  );

  const result = await computeOrderFeasibility(items);

  res.status(200).json({ success: true, data: result });
});
