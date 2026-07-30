const Worker = require("../Models/workerModel");
const catchAsync = require("../Utils/catchAsync");
const {
  SKILL_CATALOGUE,
  SKILL_INDEX,
  SKILL_LEVELS,
  labelFor,
  normaliseSkills,
} = require("../Utils/skills");

/** Escape user input before it reaches a $regex. */
const rx = (s) =>
  new RegExp(String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

/**
 * GET /worker-skills
 * The catalogue, served so the UI never keeps its own copy to drift from.
 */
exports.catalogue = catchAsync(async (req, res) => {
  res.status(200).json({
    success: true,
    data: { catalogue: SKILL_CATALOGUE, levels: SKILL_LEVELS },
  });
});

exports.index = catchAsync(async (req, res) => {
  const query = { is_deleted: false };

  if (req.query.search?.trim()) {
    const term = rx(req.query.search.trim());
    query.$or = [
      { name: term },
      { employee_code: term },
      { phone: term },
      { department: term },
    ];
  }

  // ?skill=welding,brazing — workers holding ANY of these.
  if (req.query.skill) {
    const wanted = req.query.skill
      .split(",")
      .map((s) => s.trim())
      .filter((s) => SKILL_INDEX.has(s));

    if (wanted.length) query["skills.skill"] = { $in: wanted };
  }

  if (req.query.active === "true") query.is_active = true;
  if (req.query.active === "false") query.is_active = false;

  const workers = await Worker.find(query)
    .sort({ is_active: -1, name: 1 })
    .limit(Math.min(Number(req.query.limit) || 300, 500))
    .lean();

  res.status(200).json({ success: true, data: { workers } });
});

exports.find = catchAsync(async (req, res) => {
  const worker = await Worker.findOne({
    _id: req.params.id,
    is_deleted: false,
  }).lean();

  if (!worker) {
    return res
      .status(404)
      .json({ success: false, message: "Worker not found." });
  }

  res.status(200).json({ success: true, data: { worker } });
});

exports.store = catchAsync(async (req, res) => {
  const name = req.body?.name?.trim();
  if (!name) {
    return res
      .status(400)
      .json({ success: false, message: "Worker name is required." });
  }

  const check = normaliseSkills(req.body.skills);
  if (!check.ok) {
    return res.status(400).json({ success: false, message: check.message });
  }

  // Employee codes are the thing people actually look workers up by, so a
  // duplicate is worth blocking rather than quietly allowing.
  const code = req.body.employee_code?.trim();
  if (code) {
    const clash = await Worker.findOne({
      employee_code: new RegExp(
        `^${code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
        "i"
      ),
      is_deleted: false,
    })
      .select("name")
      .lean();

    if (clash) {
      return res.status(409).json({
        success: false,
        message: `Employee code "${code}" is already used by ${clash.name}.`,
      });
    }
  }

  const worker = await Worker.create({
    ...req.body,
    name,
    skills: check.skills ?? [],
  });

  res.status(201).json({ success: true, data: { worker } });
});

exports.update = catchAsync(async (req, res) => {
  const body = { ...req.body };
  delete body._id;
  delete body.is_deleted;

  if ("skills" in body) {
    const check = normaliseSkills(body.skills);
    if (!check.ok) {
      return res.status(400).json({ success: false, message: check.message });
    }
    body.skills = check.skills;
  }

  if (body.employee_code?.trim()) {
    const code = body.employee_code.trim();
    const clash = await Worker.findOne({
      _id: { $ne: req.params.id },
      employee_code: new RegExp(
        `^${code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
        "i"
      ),
      is_deleted: false,
    })
      .select("name")
      .lean();

    if (clash) {
      return res.status(409).json({
        success: false,
        message: `Employee code "${code}" is already used by ${clash.name}.`,
      });
    }
  }

  const worker = await Worker.findOneAndUpdate(
    { _id: req.params.id, is_deleted: false },
    { $set: body },
    { new: true, runValidators: true }
  );

  if (!worker) {
    return res
      .status(404)
      .json({ success: false, message: "Worker not found." });
  }

  res.status(200).json({ success: true, data: { worker } });
});

exports.delete = catchAsync(async (req, res) => {
  await Worker.updateOne(
    { _id: req.params.id },
    { $set: { is_deleted: true } }
  );

  res.status(200).json({ success: true, message: "Worker removed." });
});

/**
 * GET /workers/skill-matrix
 *
 * Coverage per skill across active workers. The useful output isn't the
 * headcount — it's which operations only one person can do, because that's
 * where a single absence stops the line.
 */
exports.skillMatrix = catchAsync(async (req, res) => {
  const workers = await Worker.find({ is_deleted: false, is_active: true })
    .select("name employee_code skills")
    .lean();

  const byKey = new Map();

  SKILL_INDEX.forEach((meta, key) => {
    byKey.set(key, {
      ...meta,
      total: 0,
      experts: 0,
      learning: 0,
      workers: [],
    });
  });

  workers.forEach((w) => {
    (w.skills || []).forEach((s) => {
      const row = byKey.get(s.skill);
      if (!row) return;

      row.total += 1;
      if (s.level === "expert") row.experts += 1;
      if (s.level === "learning") row.learning += 1;
      row.workers.push({
        _id: w._id,
        name: w.name,
        employee_code: w.employee_code,
        level: s.level,
      });
    });
  });

  const matrix = [...byKey.values()];

  res.status(200).json({
    success: true,
    data: {
      matrix,
      headcount: workers.length,
      // Nobody at all can do these.
      uncovered: matrix
        .filter((m) => m.total === 0)
        .map((m) => ({ key: m.key, label: m.label })),
      // Exactly one person — a holiday away from a stoppage.
      singleCover: matrix
        .filter((m) => m.total === 1)
        .map((m) => ({
          key: m.key,
          label: m.label,
          worker: m.workers[0]?.name,
        })),
    },
  });
});
