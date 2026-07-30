const mongoose = require("mongoose");
const { SKILL_KEYS } = require("../Utils/skills");

/**
 * A department on the shop floor — the unit a pipeline stage points at.
 *
 * A department declares WHAT IT CAN DO — a capability set, not a sequence.
 * The drilling department is equipped for pillar drilling and radial drilling;
 * which of the two a given part needs depends on the part, not on the
 * department. Reading these as a running order would be wrong.
 *
 *   Machine Shop → can do: Lathe Turning, CNC Turning, Keyway
 *   Drilling     → can do: Pillar Drilling, Radial Drilling
 *
 * Sequence lives one level up, on the pipeline stage: a stage picks the subset
 * of its department's capabilities that this particular product needs, in the
 * order that product needs them. Same department, different routing per part.
 *
 * The operation keys are the same ones the worker skill catalogue uses, which
 * is what lets the system answer "who can staff this stage?" without a second
 * vocabulary to maintain.
 *
 * NEW collection — nothing existing reads or writes it.
 */
const DepartmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, index: true },

    code: { type: String, trim: true, default: "", uppercase: true },

    description: { type: String, default: "" },

    // UNORDERED. Stored in catalogue order purely so the list renders
    // consistently; position carries no meaning.
    operations: [
      {
        skill: { type: String, enum: SKILL_KEYS, required: true },
        // Default minutes per unit for this operation here. Optional — left
        // null until someone measures it, rather than defaulting to a
        // fabricated number. A stage can override it for a specific part.
        standard_minutes: { type: Number, default: null, min: 0 },
        note: { type: String, default: "" },
      },
    ],

    // Shown on the designer canvas so branches are visually distinguishable.
    colour: { type: String, default: "brand" },

    // How many units can be in this department at once. Informational for
    // now; the scheduler will use it later.
    capacity: { type: Number, default: 0, min: 0 },

    is_active: { type: Boolean, default: true, index: true },
    is_deleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

DepartmentSchema.index({ "operations.skill": 1 });

module.exports = mongoose.model("Department", DepartmentSchema);
