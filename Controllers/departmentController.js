const Department = require("../Models/departmentModel");
const Pipeline = require("../Models/pipelineModel");
const Worker = require("../Models/workerModel");
const catchAsync = require("../Utils/catchAsync");
const { SKILL_INDEX, SKILL_ORDER, labelFor } = require("../Utils/skills");

const rx = (s) =>
  new RegExp(String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

/**
 * Validate a department's capability list against the shared skill catalogue.
 *
 * The result is sorted into catalogue order, not the order the client sent.
 * A department's operations are a SET — the drilling department can do pillar
 * AND radial drilling, and which one a part needs is a property of the part.
 * Canonicalising the order stops anyone reading a sequence into it.
 */
function normaliseOperations(input) {
  if (input === undefined) return { ok: true, operations: undefined };
  if (!Array.isArray(input)) {
    return { ok: false, message: "`operations` must be an array." };
  }

  const seen = new Set();
  const out = [];

  for (const raw of input) {
    const skill = typeof raw === "string" ? raw : raw?.skill;
    if (!skill) continue;

    if (!SKILL_INDEX.has(skill)) {
      return { ok: false, message: `"${skill}" is not a recognised operation.` };
    }
    if (seen.has(skill)) continue;
    seen.add(skill);

    const mins =
      raw?.standard_minutes === "" || raw?.standard_minutes == null
        ? null
        : Number(raw.standard_minutes);

    if (mins !== null && (!Number.isFinite(mins) || mins < 0)) {
      return {
        ok: false,
        message: `Standard minutes for ${labelFor(skill)} must be zero or more.`,
      };
    }

    out.push({ skill, standard_minutes: mins, note: raw?.note ?? "" });
  }

  out.sort(
    (a, b) => (SKILL_ORDER.get(a.skill) ?? 0) - (SKILL_ORDER.get(b.skill) ?? 0)
  );

  return { ok: true, operations: out };
}

exports.index = catchAsync(async (req, res) => {
  const query = { is_deleted: false };
  if (req.query.search?.trim()) {
    const term = rx(req.query.search.trim());
    query.$or = [{ name: term }, { code: term }];
  }
  if (req.query.active === "true") query.is_active = true;

  const departments = await Department.find(query).sort({ name: 1 }).lean();

  // How many active workers can staff each operation — a department nobody is
  // trained for is a pipeline that can't run.
  const workers = await Worker.find({ is_deleted: false, is_active: true })
    .select("skills")
    .lean();

  const coverage = new Map();
  workers.forEach((w) =>
    (w.skills || []).forEach((s) =>
      coverage.set(s.skill, (coverage.get(s.skill) || 0) + 1)
    )
  );

  const withCoverage = departments.map((d) => {
    const ops = (d.operations || []).map((o) => ({
      ...o,
      label: labelFor(o.skill),
      trained: coverage.get(o.skill) || 0,
    }));
    return {
      ...d,
      operations: ops,
      uncovered: ops.filter((o) => o.trained === 0).length,
      min_trained: ops.length ? Math.min(...ops.map((o) => o.trained)) : 0,
    };
  });

  res.status(200).json({ success: true, data: { departments: withCoverage } });
});

exports.find = catchAsync(async (req, res) => {
  const department = await Department.findOne({
    _id: req.params.id,
    is_deleted: false,
  }).lean();

  if (!department) {
    return res
      .status(404)
      .json({ success: false, message: "Department not found." });
  }

  res.status(200).json({ success: true, data: { department } });
});

exports.store = catchAsync(async (req, res) => {
  const name = req.body?.name?.trim();
  if (!name) {
    return res
      .status(400)
      .json({ success: false, message: "Department name is required." });
  }

  const clash = await Department.findOne({
    name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
    is_deleted: false,
  })
    .select("_id")
    .lean();

  if (clash) {
    return res.status(409).json({
      success: false,
      message: `A department called "${name}" already exists.`,
    });
  }

  const check = normaliseOperations(req.body.operations);
  if (!check.ok) {
    return res.status(400).json({ success: false, message: check.message });
  }

  const department = await Department.create({
    ...req.body,
    name,
    operations: check.operations ?? [],
  });

  res.status(201).json({ success: true, data: { department } });
});

exports.update = catchAsync(async (req, res) => {
  const body = { ...req.body };
  delete body._id;
  delete body.is_deleted;

  if ("operations" in body) {
    const check = normaliseOperations(body.operations);
    if (!check.ok) {
      return res.status(400).json({ success: false, message: check.message });
    }
    body.operations = check.operations;
  }

  const department = await Department.findOneAndUpdate(
    { _id: req.params.id, is_deleted: false },
    { $set: body },
    { new: true, runValidators: true }
  );

  if (!department) {
    return res
      .status(404)
      .json({ success: false, message: "Department not found." });
  }

  res.status(200).json({ success: true, data: { department } });
});

exports.delete = catchAsync(async (req, res) => {
  // Removing a department that a pipeline points at would leave that pipeline
  // referencing nothing, so block it and say where it's used.
  const used = await Pipeline.find({
    "stages.department_id": req.params.id,
    is_deleted: false,
  })
    .select("name")
    .lean();

  if (used.length) {
    return res.status(400).json({
      success: false,
      message: `This department is used by ${used.length} pipeline(s): ${used
        .map((p) => p.name)
        .join(", ")}. Remove those stages first.`,
    });
  }

  await Department.updateOne(
    { _id: req.params.id },
    { $set: { is_deleted: true } }
  );

  res.status(200).json({ success: true, message: "Department removed." });
});
