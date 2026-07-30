const mongoose = require("mongoose");
const { SKILL_KEYS } = require("../Utils/skills");

/**
 * A manufacturing pipeline — a reusable template describing how a product is
 * routed through departments.
 *
 * Stored as a DAG rather than a list, because real routing branches and
 * converges:
 *
 *     Casting machining ─┐
 *     Shaft machining  ──┼─→ Assembly → Testing → Painting & Packing
 *     Stator pressing ───┘
 *
 * Each stage names its predecessors. A stage with no predecessors is a start
 * point; several may run in parallel. Cycle rejection lives in the controller
 * so the error can name the offending stage.
 *
 * `x`/`y` are canvas coordinates from the designer. They're presentation only
 * — the graph is defined entirely by `depends_on`, so a pipeline stays valid
 * even if the layout is lost.
 *
 * NEW collection — nothing existing reads or writes it.
 */

const StageOperationSchema = new mongoose.Schema(
  {
    skill: { type: String, enum: SKILL_KEYS, required: true },
    // Overrides the department's default for this part. Null = inherit.
    standard_minutes: { type: Number, default: null, min: 0 },
    note: { type: String, default: "" },
  },
  { _id: false }
);

const StageSchema = new mongoose.Schema(
  {
    // Stable within the pipeline; edges reference this, not the _id, so a
    // stage can be re-created in the editor without breaking links.
    key: { type: String, required: true },

    department_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: true,
    },

    // Overrides the department name on the canvas when the same department
    // appears twice ("Machining — rotor" vs "Machining — shaft").
    label: { type: String, trim: true, default: "" },

    /**
     * Which of the department's capabilities this stage actually uses, IN
     * ORDER. This is where sequence lives, because sequence is a property of
     * the part, not of the department.
     *
     *   Drilling dept can do: pillar, radial
     *     Pump body stage    → [radial]
     *     Bearing cover stage→ [pillar]
     *     Casing stage       → [pillar, radial]
     *
     * Empty means "not narrowed down" — every capability of the department is
     * assumed to apply. That's a legitimate draft state, not an error.
     *
     * Validated as a subset of the department's operations in the controller,
     * where the department documents are already loaded.
     */
    operations: [StageOperationSchema],

    depends_on: [{ type: String }],

    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },

    note: { type: String, default: "" },
  },
  { _id: false }
);

const PipelineSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    code: { type: String, trim: true, default: "", uppercase: true },
    description: { type: String, default: "" },

    stages: [StageSchema],

    // Which products this routing applies to. Empty means "not yet assigned".
    items: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Item",
        index: true,
      },
    ],

    is_active: { type: Boolean, default: true, index: true },
    is_deleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

/** Stages nothing depends on — where production starts. */
PipelineSchema.virtual("startStages").get(function () {
  return (this.stages || []).filter((s) => !s.depends_on?.length);
});

/** Stages that feed nothing — where it finishes. */
PipelineSchema.virtual("endStages").get(function () {
  const referenced = new Set(
    (this.stages || []).flatMap((s) => s.depends_on || [])
  );
  return (this.stages || []).filter((s) => !referenced.has(s.key));
});

PipelineSchema.set("toJSON", { virtuals: true });
PipelineSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Pipeline", PipelineSchema);
