const mongoose = require("mongoose");
const Pipeline = require("../Models/pipelineModel");
const Department = require("../Models/departmentModel");
const Item = require("../Models/itemModel");
const catchAsync = require("../Utils/catchAsync");
const { validateStages, analyse, computeLevels } = require("../Utils/pipelineGraph");
const { labelFor } = require("../Utils/skills");

const rx = (s) =>
  new RegExp(String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

/**
 * Every referenced department must exist and be live, and every operation a
 * stage claims must be something that department is actually equipped for.
 *
 * The second half is the point: a stage narrows a department's capability set
 * down to what this particular part needs (drilling → radial only). Narrowing
 * to something outside the set is a mistake worth catching, not a routing.
 */
async function checkDepartments(stages) {
  const ids = [...new Set(stages.map((s) => String(s.department_id)))];
  if (!ids.length) return { ok: true };

  const bad = ids.filter((id) => !mongoose.isValidObjectId(id));
  if (bad.length) {
    return { ok: false, message: "A stage points at an invalid department." };
  }

  const found = await Department.find({ _id: { $in: ids }, is_deleted: false })
    .select("_id name operations")
    .lean();

  if (found.length !== ids.length) {
    return {
      ok: false,
      message:
        "One or more stages point at a department that no longer exists. Remove or repoint them.",
    };
  }

  const capabilities = new Map(
    found.map((d) => [
      String(d._id),
      { name: d.name, skills: new Set((d.operations || []).map((o) => o.skill)) },
    ])
  );

  for (const stage of stages) {
    if (!stage.operations?.length) continue;

    const dept = capabilities.get(String(stage.department_id));
    if (!dept) continue;

    const outside = stage.operations.find((o) => !dept.skills.has(o.skill));
    if (outside) {
      return {
        ok: false,
        message: `"${
          stage.label || dept.name
        }" uses ${labelFor(outside.skill)}, but ${
          dept.name
        } isn't set up for it. Add it to the department first.`,
        stageKey: stage.key,
      };
    }
  }

  return { ok: true };
}

exports.index = catchAsync(async (req, res) => {
  const query = { is_deleted: false };
  if (req.query.search?.trim()) {
    const term = rx(req.query.search.trim());
    query.$or = [{ name: term }, { code: term }];
  }
  if (req.query.item_id) query.items = req.query.item_id;

  const pipelines = await Pipeline.find(query)
    .populate("items", "name full_code type")
    .sort({ updatedAt: -1 })
    .lean();

  // Cheap summary for the list view — stage count and how wide the widest
  // parallel step is, which is the interesting shape at a glance.
  const withSummary = pipelines.map((p) => {
    const stages = p.stages || [];
    let widest = 0;

    if (stages.length) {
      const levels = computeLevels(stages);
      const perLevel = new Map();
      levels.forEach((l) => perLevel.set(l, (perLevel.get(l) || 0) + 1));
      widest = Math.max(...perLevel.values());
    }

    return {
      ...p,
      stage_count: stages.length,
      depth: stages.length ? Math.max(...computeLevels(stages).values()) + 1 : 0,
      widest_parallel: widest,
    };
  });

  res.status(200).json({ success: true, data: { pipelines: withSummary } });
});

exports.find = catchAsync(async (req, res) => {
  const pipeline = await Pipeline.findOne({
    _id: req.params.id,
    is_deleted: false,
  })
    .populate("stages.department_id", "name code colour operations")
    .populate("items", "name full_code type")
    .lean();

  if (!pipeline) {
    return res
      .status(404)
      .json({ success: false, message: "Pipeline not found." });
  }

  const { warnings } = analyse(pipeline.stages || []);

  res.status(200).json({ success: true, data: { pipeline, warnings } });
});

exports.store = catchAsync(async (req, res) => {
  const name = req.body?.name?.trim();
  if (!name) {
    return res
      .status(400)
      .json({ success: false, message: "Pipeline name is required." });
  }

  const check = validateStages(req.body.stages ?? []);
  if (!check.ok) {
    return res
      .status(400)
      .json({ success: false, message: check.message, data: { stageKey: check.stageKey } });
  }

  const deps = await checkDepartments(check.stages);
  if (!deps.ok) {
    return res.status(400).json({
      success: false,
      message: deps.message,
      data: { stageKey: deps.stageKey },
    });
  }

  const pipeline = await Pipeline.create({
    ...req.body,
    name,
    stages: check.stages,
  });

  const { warnings } = analyse(check.stages);

  res.status(201).json({ success: true, data: { pipeline, warnings } });
});

exports.update = catchAsync(async (req, res) => {
  const body = { ...req.body };
  delete body._id;
  delete body.is_deleted;

  let warnings = [];

  if ("stages" in body) {
    const check = validateStages(body.stages);
    if (!check.ok) {
      return res.status(400).json({
        success: false,
        message: check.message,
        data: { stageKey: check.stageKey },
      });
    }

    const deps = await checkDepartments(check.stages);
    if (!deps.ok) {
      return res.status(400).json({
        success: false,
        message: deps.message,
        data: { stageKey: deps.stageKey },
      });
    }

    body.stages = check.stages;
    warnings = analyse(check.stages).warnings;
  }

  const pipeline = await Pipeline.findOneAndUpdate(
    { _id: req.params.id, is_deleted: false },
    { $set: body },
    { new: true, runValidators: true }
  ).populate("stages.department_id", "name code colour operations");

  if (!pipeline) {
    return res
      .status(404)
      .json({ success: false, message: "Pipeline not found." });
  }

  res.status(200).json({ success: true, data: { pipeline, warnings } });
});

exports.delete = catchAsync(async (req, res) => {
  await Pipeline.updateOne(
    { _id: req.params.id },
    { $set: { is_deleted: true } }
  );
  res.status(200).json({ success: true, message: "Pipeline removed." });
});

/**
 * POST /pipelines/validate — check a draft without saving, so the designer can
 * warn while you're still drawing.
 */
exports.validate = catchAsync(async (req, res) => {
  const check = validateStages(req.body?.stages ?? []);

  if (!check.ok) {
    return res.status(200).json({
      success: true,
      data: { valid: false, message: check.message, stageKey: check.stageKey },
    });
  }

  // Catches a stage asking its department for something it isn't set up to do
  // — e.g. after someone removed Radial Drilling from the drilling department.
  const deps = await checkDepartments(check.stages);
  if (!deps.ok) {
    return res.status(200).json({
      success: true,
      data: { valid: false, message: deps.message, stageKey: deps.stageKey },
    });
  }

  const { warnings, starts, ends } = analyse(check.stages);

  res.status(200).json({
    success: true,
    data: {
      valid: true,
      warnings,
      starts: starts?.map((s) => s.key) ?? [],
      ends: ends?.map((s) => s.key) ?? [],
    },
  });
});

/** Attach / detach the products this routing covers. */
exports.setItems = catchAsync(async (req, res) => {
  const ids = (req.body?.items ?? []).filter((i) =>
    mongoose.isValidObjectId(String(i))
  );

  const found = await Item.find({ _id: { $in: ids }, is_deleted: false })
    .select("_id")
    .lean();

  const pipeline = await Pipeline.findOneAndUpdate(
    { _id: req.params.id, is_deleted: false },
    { $set: { items: found.map((f) => f._id) } },
    { new: true }
  ).populate("items", "name full_code type");

  if (!pipeline) {
    return res
      .status(404)
      .json({ success: false, message: "Pipeline not found." });
  }

  res.status(200).json({ success: true, data: { pipeline } });
});
