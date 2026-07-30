/**
 * The shop-floor skill catalogue.
 *
 * Skills are stored on workers by KEY, never by label, so renaming
 * "Test Bed Fitting" tomorrow doesn't orphan every worker who has it.
 *
 * Structure mirrors how the operations are actually grouped: most skills are
 * standalone, a few (Turning, Drilling, Motor Winding, Assembly) have distinct
 * sub-operations that need tracking separately — a lathe hand isn't
 * necessarily a CNC hand.
 *
 * Only LEAVES are assignable. A worker is marked as "CNC Turning", not the
 * umbrella "Turning", so the coverage matrix can't be ambiguous about who can
 * actually run which machine.
 *
 * This file is served to the frontend via GET /worker-skills so there is one
 * source of truth rather than two lists drifting apart.
 */

const SKILL_CATALOGUE = [
  { key: "hacksaw_cutting", label: "Hacksaw Cutting" },
  { key: "casting_grinding", label: "Casting Grinding" },
  {
    key: "turning",
    label: "Turning",
    children: [
      { key: "turning_lathe", label: "Lathe Turning" },
      { key: "turning_cnc", label: "CNC Turning" },
    ],
  },
  { key: "keyway", label: "Keyway" },
  { key: "pressing", label: "Pressing" },
  {
    key: "drilling",
    label: "Drilling",
    children: [
      { key: "drilling_pillar", label: "Pillar Drilling" },
      { key: "drilling_radial", label: "Radial Drilling" },
    ],
  },
  { key: "brazing", label: "Brazing" },
  { key: "welding", label: "Welding" },
  { key: "balancing", label: "Balancing" },
  {
    key: "motor_winding",
    label: "Motor Winding",
    children: [
      { key: "motor_winding_coil", label: "Coil Making and Jointing" },
      { key: "motor_winding_winding", label: "Winding" },
    ],
  },
  { key: "varnishing", label: "Varnishing" },
  {
    key: "assembly",
    label: "Assembly",
    children: [
      { key: "assembly_sub", label: "Sub Assembly" },
      { key: "assembly_main", label: "Main Assembly" },
    ],
  },
  { key: "painting", label: "Painting" },
  { key: "packing", label: "Packing" },
  { key: "test_bed_fitting", label: "Test Bed Fitting" },
  { key: "material_handling", label: "Material Handling" },
  {
    key: "repairing_pump_dismantling",
    label: "Repairing / Pump Dismantling",
  },
];

/** Every assignable key, flattened. Parents with children are not assignable. */
const SKILL_KEYS = SKILL_CATALOGUE.flatMap((s) =>
  s.children?.length ? s.children.map((c) => c.key) : [s.key]
);

/** key -> { key, label, group, groupLabel } */
const SKILL_INDEX = new Map();
SKILL_CATALOGUE.forEach((s) => {
  if (s.children?.length) {
    s.children.forEach((c) =>
      SKILL_INDEX.set(c.key, {
        key: c.key,
        label: c.label,
        group: s.key,
        groupLabel: s.label,
      })
    );
  } else {
    SKILL_INDEX.set(s.key, {
      key: s.key,
      label: s.label,
      group: null,
      groupLabel: null,
    });
  }
});

/**
 * Canonical position of each key in the catalogue.
 *
 * Used to sort a department's capability list. A department's operations are a
 * SET, not a sequence — the drilling department can do pillar and radial
 * drilling, and which one a part needs depends on the part. Sorting them into
 * a fixed catalogue order makes that explicit: no one can read a running order
 * into a list the user never ordered.
 */
const SKILL_ORDER = new Map([...SKILL_INDEX.keys()].map((k, i) => [k, i]));

/** How good they are at it. Kept short — anything longer never gets maintained. */
const SKILL_LEVELS = ["learning", "competent", "expert"];

const labelFor = (key) => SKILL_INDEX.get(key)?.label ?? key;

/**
 * Validate and de-duplicate an incoming skills array.
 * Accepts either ["welding"] or [{ skill: "welding", level: "expert" }].
 */
function normaliseSkills(input) {
  if (input === undefined) return { ok: true, skills: undefined };
  if (!Array.isArray(input)) {
    return { ok: false, message: "`skills` must be an array." };
  }

  const seen = new Set();
  const out = [];

  for (const raw of input) {
    const key = typeof raw === "string" ? raw : raw?.skill;

    if (!key) continue;

    if (!SKILL_INDEX.has(key)) {
      return { ok: false, message: `"${key}" is not a recognised skill.` };
    }
    if (seen.has(key)) continue; // silently collapse duplicates
    seen.add(key);

    const level = typeof raw === "string" ? "competent" : raw?.level;
    if (level && !SKILL_LEVELS.includes(level)) {
      return {
        ok: false,
        message: `"${level}" is not a valid level for ${labelFor(key)}.`,
      };
    }

    out.push({
      skill: key,
      level: level || "competent",
      note: (typeof raw === "object" && raw?.note) || "",
    });
  }

  return { ok: true, skills: out };
}

module.exports = {
  SKILL_CATALOGUE,
  SKILL_KEYS,
  SKILL_INDEX,
  SKILL_ORDER,
  SKILL_LEVELS,
  labelFor,
  normaliseSkills,
};
