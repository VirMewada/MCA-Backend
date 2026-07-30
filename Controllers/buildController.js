const mongoose = require("mongoose");
const Item = require("../Models/itemModel");
const Build = require("../Models/buildModel");
const Transaction = require("../Models/transactionModel");
const catchAsync = require("../Utils/catchAsync");
const { isMakeable, effectiveQty, computeBuildable } = require("../Utils/bom");

/**
 * Manufacturing operations.
 *
 * Building is the piece the system was missing: the BOM described what a
 * wound stator is made of, but nothing ever consumed it. Stock on assemblies
 * could only ever be maintained by hand, so it was guaranteed to drift.
 *
 * Everything here is ADDITIVE — new collection, new endpoints. No existing
 * document is read differently or written to in a new shape.
 */

/* ------------------------------------------------------------------ */
/* Transaction support                                                 */
/* ------------------------------------------------------------------ */

/**
 * Multi-document transactions need a replica set. Atlas (mongodb+srv) always
 * is one, but a local standalone mongod isn't — so we detect rather than
 * assume, and fall back to a guarded compensating path in dev.
 *
 * The fallback is genuinely weaker: it can leave stock inconsistent if the
 * process dies mid-rollback. Builds that took that path are flagged
 * `non_atomic: true` so you can find them later.
 */
async function withOptionalTransaction(work) {
  let session = null;

  try {
    session = await mongoose.startSession();
  } catch (_) {
    return { result: await work(null), atomic: false };
  }

  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return { result, atomic: true };
  } catch (err) {
    const unsupported =
      err?.code === 20 ||
      /Transaction numbers are only allowed on a replica set|Transactions are not supported/i.test(
        err?.message ?? ""
      );

    if (!unsupported) throw err;

    // Standalone mongod — retry without a session.
    return { result: await work(null), atomic: false };
  } finally {
    session?.endSession();
  }
}

const opts = (session) => (session ? { session } : {});

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */

/**
 * POST /items/:id/build
 * body: { quantity, person_name?, note? }
 *
 * Consumes every direct child per the BOM (including scrap allowance) and
 * produces the parent. All-or-nothing: if any component is short, nothing
 * moves.
 */
exports.build = catchAsync(async (req, res) => {
  const { quantity, person_name, note } = req.body;

  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    return res.status(400).json({
      success: false,
      message: "Quantity must be a number greater than zero.",
    });
  }

  const parent = await Item.findOne({
    _id: req.params.id,
    is_deleted: false,
  }).lean();

  if (!parent) {
    return res.status(404).json({ success: false, message: "Item not found." });
  }

  if (!isMakeable(parent)) {
    return res.status(400).json({
      success: false,
      message:
        parent.procurement_type === "buy"
          ? "This item is marked as purchased, so it can't be built."
          : "This item has no bill of materials, so there's nothing to build.",
    });
  }

  // Resolve the BOM lines against live component documents.
  const childIds = (parent.children || []).map((c) =>
    String(c.item_id?._id ?? c.item_id)
  );

  const components = await Item.find({
    _id: { $in: childIds },
    is_deleted: false,
  })
    .select("name full_code unit stock")
    .lean();

  const componentById = new Map(components.map((c) => [String(c._id), c]));

  const missing = childIds.filter((id) => !componentById.has(id));
  if (missing.length) {
    return res.status(400).json({
      success: false,
      message:
        "This BOM references components that no longer exist. Fix the bill of materials before building.",
      data: { missing },
    });
  }

  // Work out required quantities and check availability up front, so we can
  // report EVERY shortage at once rather than failing on the first.
  const lines = (parent.children || []).map((c) => {
    const id = String(c.item_id?._id ?? c.item_id);
    const comp = componentById.get(id);
    const perUnit = effectiveQty(c);
    const total = perUnit * qty;

    return {
      item_id: id,
      name: comp.name,
      full_code: comp.full_code,
      unit: comp.unit,
      per_unit: Number(perUnit.toFixed(6)),
      scrap_pct: Number(c.scrap_pct) || 0,
      total_quantity: Number(total.toFixed(6)),
      available: Number(comp.stock) || 0,
    };
  });

  const short = lines.filter((l) => l.available < l.total_quantity);
  if (short.length) {
    return res.status(400).json({
      success: false,
      message: `Not enough stock to build ${qty}. Short on ${short
        .map((s) => s.name)
        .join(", ")}.`,
      data: {
        shortages: short.map((s) => ({
          ...s,
          shortfall: Number((s.total_quantity - s.available).toFixed(6)),
        })),
      },
    });
  }

  const unitCost = Number(parent.costing?.latest_cost) || 0;

  const { result, atomic } = await withOptionalTransaction(async (session) => {
    const applied = [];

    try {
      // Deduct each component. The stock guard lives in the filter, so a
      // concurrent issue that drains a component makes this return null
      // rather than letting stock go negative.
      for (const line of lines) {
        const updated = await Item.findOneAndUpdate(
          { _id: line.item_id, stock: { $gte: line.total_quantity } },
          { $inc: { stock: -line.total_quantity } },
          { new: true, ...opts(session) }
        );

        if (!updated) {
          const err = new Error(
            `Stock for "${line.name}" changed while the build was running. Nothing was applied — please retry.`
          );
          err.statusCode = 409;
          throw err;
        }

        line.stock_after = updated.stock;
        applied.push(line);
      }

      const producedParent = await Item.findByIdAndUpdate(
        parent._id,
        { $inc: { stock: qty } },
        { new: true, ...opts(session) }
      );

      const [buildDoc] = await Build.create(
        [
          {
            item_id: parent._id,
            item_snapshot: {
              name: parent.name,
              full_code: parent.full_code,
              type: parent.type,
              unit: parent.unit,
            },
            quantity: qty,
            consumed: lines.map((l) => ({
              item_id: l.item_id,
              name: l.name,
              full_code: l.full_code,
              unit: l.unit,
              per_unit: l.per_unit,
              scrap_pct: l.scrap_pct,
              total_quantity: l.total_quantity,
              stock_after: l.stock_after,
            })),
            unit_cost: unitCost,
            total_cost: Number((unitCost * qty).toFixed(4)),
            person_name: person_name?.trim() || null,
            note: note ?? "",
            non_atomic: !session,
          },
        ],
        opts(session)
      );

      const txRows = lines.map((l) => ({
        item_id: l.item_id,
        type: "consume",
        quantity: l.total_quantity,
        person_name: person_name?.trim() || null,
        note: `Consumed by build of ${parent.name}`,
        build_id: buildDoc._id,
        parent_item_id: parent._id,
        stock_after: l.stock_after,
      }));

      txRows.push({
        item_id: parent._id,
        type: "produce",
        quantity: qty,
        person_name: person_name?.trim() || null,
        note: note || `Built ${qty} ${parent.unit ?? ""}`.trim(),
        build_id: buildDoc._id,
        parent_item_id: null,
        stock_after: producedParent.stock,
      });

      await Transaction.insertMany(txRows, opts(session));

      return { build: buildDoc, parentStock: producedParent.stock };
    } catch (err) {
      // Compensating rollback for the non-transactional path. Inside a real
      // transaction this is unnecessary (the abort handles it) but harmless,
      // because throwing aborts before these writes commit.
      if (!session && applied.length) {
        for (const line of applied) {
          await Item.updateOne(
            { _id: line.item_id },
            { $inc: { stock: line.total_quantity } }
          ).catch(() => {});
        }
      }
      throw err;
    }
  });

  res.status(201).json({
    success: true,
    message: `Built ${qty} × ${parent.name}.`,
    data: {
      build: result.build,
      stock: result.parentStock,
      atomic,
    },
  });
});

/* ------------------------------------------------------------------ */
/* Reverse a build                                                     */
/* ------------------------------------------------------------------ */

/**
 * POST /builds/:id/reverse
 *
 * Undoes a build: components go back on the shelf, the parent comes off it.
 * Refuses if the parent stock has already been consumed elsewhere, because
 * silently driving it negative would be worse than failing.
 */
exports.reverseBuild = catchAsync(async (req, res) => {
  const { person_name, note } = req.body ?? {};

  const original = await Build.findById(req.params.id);

  if (!original) {
    return res
      .status(404)
      .json({ success: false, message: "Build not found." });
  }

  if (original.status === "reversed") {
    return res.status(400).json({
      success: false,
      message: "This build has already been reversed.",
    });
  }

  const { result, atomic } = await withOptionalTransaction(async (session) => {
    // Take the parent back off the shelf first — this is the step most likely
    // to fail, and failing before we've returned any components keeps the
    // rollback surface small.
    const parent = await Item.findOneAndUpdate(
      { _id: original.item_id, stock: { $gte: original.quantity } },
      { $inc: { stock: -original.quantity } },
      { new: true, ...opts(session) }
    );

    if (!parent) {
      const err = new Error(
        `Can't reverse: only some of those ${original.quantity} units are still in stock. Issue or adjust the remainder first.`
      );
      err.statusCode = 409;
      throw err;
    }

    const applied = [];

    try {
      for (const line of original.consumed) {
        const updated = await Item.findByIdAndUpdate(
          line.item_id,
          { $inc: { stock: line.total_quantity } },
          { new: true, ...opts(session) }
        );
        applied.push({ line, stock_after: updated?.stock ?? null });
      }

      const [reversal] = await Build.create(
        [
          {
            item_id: original.item_id,
            item_snapshot: original.item_snapshot,
            quantity: original.quantity,
            consumed: original.consumed,
            unit_cost: original.unit_cost,
            total_cost: original.total_cost,
            status: "completed",
            reverses: original._id,
            person_name: person_name?.trim() || null,
            note: note || `Reversal of build ${original._id}`,
            non_atomic: !session,
          },
        ],
        opts(session)
      );

      const txRows = applied.map(({ line, stock_after }) => ({
        item_id: line.item_id,
        type: "unbuild_return",
        quantity: line.total_quantity,
        person_name: person_name?.trim() || null,
        note: `Returned by reversal of ${original.item_snapshot?.name ?? "build"}`,
        build_id: reversal._id,
        parent_item_id: original.item_id,
        stock_after,
      }));

      txRows.push({
        item_id: original.item_id,
        type: "unbuild_remove",
        quantity: original.quantity,
        person_name: person_name?.trim() || null,
        note: note || "Build reversed",
        build_id: reversal._id,
        stock_after: parent.stock,
      });

      await Transaction.insertMany(txRows, opts(session));

      await Build.updateOne(
        { _id: original._id },
        { $set: { status: "reversed", reversed_by: reversal._id } },
        opts(session)
      );

      return { reversal, parentStock: parent.stock };
    } catch (err) {
      if (!session) {
        await Item.updateOne(
          { _id: original.item_id },
          { $inc: { stock: original.quantity } }
        ).catch(() => {});
        for (const { line } of applied) {
          await Item.updateOne(
            { _id: line.item_id },
            { $inc: { stock: -line.total_quantity } }
          ).catch(() => {});
        }
      }
      throw err;
    }
  });

  res.status(200).json({
    success: true,
    message: "Build reversed.",
    data: { build: result.reversal, stock: result.parentStock, atomic },
  });
});

/* ------------------------------------------------------------------ */
/* History                                                             */
/* ------------------------------------------------------------------ */

/**
 * GET /builds?item_id=&limit=&page=
 * Also returns builds that CONSUMED the given item, so you can answer
 * "where did my stator shafts go?".
 */
exports.index = catchAsync(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const page = Math.max(Number(req.query.page) || 1, 1);

  const query = {};
  if (req.query.item_id) {
    query.$or = [
      { item_id: req.query.item_id },
      { "consumed.item_id": req.query.item_id },
    ];
  }
  if (req.query.status) query.status = req.query.status;

  const [builds, total] = await Promise.all([
    Build.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Build.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    data: { builds, total, page, limit },
  });
});

exports.show = catchAsync(async (req, res) => {
  const build = await Build.findById(req.params.id).lean();

  if (!build) {
    return res
      .status(404)
      .json({ success: false, message: "Build not found." });
  }

  res.status(200).json({ success: true, data: { build } });
});

/**
 * GET /items/:id/buildable — re-exported here so the manufacturing routes
 * live together. Same implementation as itemController.getBuildable.
 */
exports.buildable = catchAsync(async (req, res) => {
  const result = await computeBuildable(req.params.id);

  if (result.error) {
    return res.status(404).json({ success: false, message: result.error });
  }

  res.status(200).json({ success: true, data: result });
});
