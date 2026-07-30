/**
 * Pipeline graph validation and analysis.
 *
 * Kept separate from Utils/bom.js because that one walks item BOMs out of the
 * database; this one operates on a plain stage array handed in from the
 * designer, with no I/O. That makes it directly unit-testable.
 *
 * Everything here is iterative — a cyclic graph is exactly what the validator
 * exists to catch, so it must not be possible for the validator itself to
 * recurse forever on one.
 */

const { SKILL_INDEX, labelFor } = require("./skills");

/**
 * Validate a stage array.
 * @returns { ok: true, stages } | { ok: false, message, stageKey? }
 */
function validateStages(stages) {
  if (!Array.isArray(stages)) {
    return { ok: false, message: "`stages` must be an array." };
  }
  if (!stages.length) {
    return { ok: true, stages: [] };
  }

  const seen = new Set();
  const normalised = [];

  for (const raw of stages) {
    const key = String(raw?.key ?? "").trim();
    if (!key) {
      return { ok: false, message: "Every stage needs a key." };
    }
    if (seen.has(key)) {
      return { ok: false, message: `Two stages share the key "${key}".`, stageKey: key };
    }
    seen.add(key);

    const departmentId = String(raw?.department_id?._id ?? raw?.department_id ?? "");
    if (!departmentId) {
      return {
        ok: false,
        message: `Stage "${raw?.label || key}" isn't linked to a department.`,
        stageKey: key,
      };
    }

    // The stage's operations ARE ordered — this is the running order for the
    // part being made, chosen from what the department can do. Duplicates are
    // collapsed; the subset check against the department happens in the
    // controller, where the department docs are loaded.
    const ops = [];
    const opSeen = new Set();

    for (const rawOp of raw.operations || []) {
      const opKey = typeof rawOp === "string" ? rawOp : rawOp?.skill;
      if (!opKey || opSeen.has(opKey)) continue;

      if (!SKILL_INDEX.has(opKey)) {
        return {
          ok: false,
          message: `"${opKey}" is not a recognised operation.`,
          stageKey: key,
        };
      }
      opSeen.add(opKey);

      const mins =
        rawOp?.standard_minutes === "" || rawOp?.standard_minutes == null
          ? null
          : Number(rawOp.standard_minutes);

      if (mins !== null && (!Number.isFinite(mins) || mins < 0)) {
        return {
          ok: false,
          message: `Minutes for ${labelFor(opKey)} on "${
            raw.label || key
          }" must be zero or more.`,
          stageKey: key,
        };
      }

      ops.push({ skill: opKey, standard_minutes: mins, note: rawOp?.note ?? "" });
    }

    const deps = [...new Set((raw.depends_on || []).map((d) => String(d)))];

    if (deps.includes(key)) {
      return {
        ok: false,
        message: `"${raw.label || key}" depends on itself.`,
        stageKey: key,
      };
    }

    normalised.push({
      key,
      department_id: departmentId,
      label: raw.label ?? "",
      operations: ops,
      depends_on: deps,
      x: Number(raw.x) || 0,
      y: Number(raw.y) || 0,
      note: raw.note ?? "",
    });
  }

  // Dependencies must point at stages that exist.
  for (const s of normalised) {
    const missing = s.depends_on.find((d) => !seen.has(d));
    if (missing) {
      return {
        ok: false,
        message: `"${s.label || s.key}" depends on a stage that no longer exists.`,
        stageKey: s.key,
      };
    }
  }

  const cycle = findCycle(normalised);
  if (cycle) {
    return {
      ok: false,
      message: `These stages form a loop: ${cycle.join(" → ")}. Production could never start.`,
      stageKey: cycle[0],
    };
  }

  return { ok: true, stages: normalised };
}

/**
 * Iterative DFS with an explicit colour map.
 * Returns the cycle as an array of keys, or null.
 *   0 = unvisited, 1 = on the current path, 2 = fully explored
 *
 * The enter/exit framing matters: a node can only be marked "fully explored"
 * AFTER its dependencies have been walked. Setting colour 2 at push time (as
 * the first version did) means a node is never seen as on-path, and no cycle
 * is ever detected.
 */
function findCycle(stages) {
  const deps = new Map(stages.map((s) => [s.key, s.depends_on || []]));
  const colour = new Map(stages.map((s) => [s.key, 0]));
  const parent = new Map();

  /** Walk parents back from `from` up to `to` to spell out the loop. */
  const reconstruct = (from, to) => {
    const path = [from];
    let cur = from;
    // Bounded by the node count — a corrupt parent map can't hang this.
    for (let i = 0; cur !== to && i <= deps.size; i += 1) {
      cur = parent.get(cur);
      if (cur === undefined) break;
      path.push(cur);
    }
    return path.reverse().concat(to);
  };

  for (const start of deps.keys()) {
    if (colour.get(start) !== 0) continue;

    const stack = [{ key: start, phase: "enter" }];

    while (stack.length) {
      const frame = stack.pop();

      if (frame.phase === "exit") {
        colour.set(frame.key, 2);
        continue;
      }
      if (colour.get(frame.key) !== 0) continue;

      colour.set(frame.key, 1);
      // Re-queue as "exit" so it's marked done only after its children.
      stack.push({ key: frame.key, phase: "exit" });

      for (const d of deps.get(frame.key) || []) {
        if (colour.get(d) === 1) return reconstruct(frame.key, d);
        if (colour.get(d) === 0) {
          parent.set(d, frame.key);
          stack.push({ key: d, phase: "enter" });
        }
      }
    }
  }

  return null;
}

/**
 * Longest-path layering: every stage sits one level after its deepest
 * predecessor. Stages on the same level can run in parallel, which is exactly
 * what the auto-layout and the future scheduler both need.
 */
function computeLevels(stages) {
  const byKey = new Map(stages.map((s) => [s.key, s]));
  const levels = new Map();

  const resolve = (key, guard = new Set()) => {
    if (levels.has(key)) return levels.get(key);
    if (guard.has(key)) return 0; // cyclic input; validate first
    guard.add(key);

    const stage = byKey.get(key);
    const deps = stage?.depends_on || [];
    const level = deps.length
      ? Math.max(...deps.map((d) => resolve(d, guard))) + 1
      : 0;

    levels.set(key, level);
    return level;
  };

  stages.forEach((s) => resolve(s.key));
  return levels;
}

/**
 * Warnings that shouldn't block saving but are worth surfacing — a half-built
 * pipeline is a normal intermediate state, not an error.
 */
function analyse(stages) {
  if (!stages.length) return { warnings: [], levels: new Map() };

  const levels = computeLevels(stages);
  const referenced = new Set(stages.flatMap((s) => s.depends_on || []));

  const starts = stages.filter((s) => !s.depends_on?.length);
  const ends = stages.filter((s) => !referenced.has(s.key));

  const warnings = [];

  if (!starts.length) {
    warnings.push("No starting stage — every stage waits on another.");
  }
  if (ends.length > 1) {
    warnings.push(
      `${ends.length} stages are end points (${ends
        .map((s) => s.label || s.key)
        .join(", ")}). Usually a pipeline converges on one.`
    );
  }
  // A stage that neither depends on anything nor feeds anything is stranded.
  const orphans = stages.filter(
    (s) => !s.depends_on?.length && !referenced.has(s.key) && stages.length > 1
  );
  if (orphans.length) {
    warnings.push(
      `Not connected to anything: ${orphans
        .map((s) => s.label || s.key)
        .join(", ")}.`
    );
  }

  return { warnings, levels, starts, ends };
}

module.exports = { validateStages, findCycle, computeLevels, analyse };
