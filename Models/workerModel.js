const mongoose = require("mongoose");
const { SKILL_KEYS, SKILL_LEVELS } = require("../Utils/skills");

/**
 * A person on the shop floor.
 *
 * Skills are stored by key against the catalogue in Utils/skills.js — the enum
 * below is generated from it, so adding a skill there is the only change
 * needed. NEW collection; nothing existing touches it.
 */
const WorkerSkillSchema = new mongoose.Schema(
  {
    skill: {
      type: String,
      enum: SKILL_KEYS,
      required: true,
    },
    level: {
      type: String,
      enum: SKILL_LEVELS,
      default: "competent",
    },
    note: { type: String, default: "" },
  },
  { _id: false }
);

const WorkerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, index: true },

    // Payroll / punch-card number.
    employee_code: { type: String, trim: true, default: "", index: true },

    country_code: { type: String, trim: true, default: "91" },
    phone: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, lowercase: true, default: "" },

    // Free text on purpose — departments differ per plant and a fixed enum
    // would be wrong within a month.
    department: { type: String, trim: true, default: "" },

    shift: {
      type: String,
      enum: ["general", "first", "second", "third", ""],
      default: "general",
    },

    employment_type: {
      type: String,
      enum: ["permanent", "contract", "apprentice", ""],
      default: "permanent",
    },

    date_of_joining: Date,

    skills: [WorkerSkillSchema],

    is_active: { type: Boolean, default: true, index: true },

    note: { type: String, default: "" },

    is_deleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

WorkerSchema.index({ "skills.skill": 1 });

module.exports = mongoose.model("Worker", WorkerSchema);
