import mongoose from "mongoose";

const jobSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
      match: /^[A-Za-z0-9_\-]+$/,
    },
    command: {
      type: [String],
      required: true,
    },
    isShell: {
      type: Boolean,
      required: true,
      default: false,
    },
    state: {
      type: String,
      enum: ["pending", "processing", "completed", "failed", "dead"],
      default: "pending",
      required: true,
      index: true,
    },
    attempts: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    maxRetries: {
      type: Number,
      required: true,
      min: 0,
    },
    priority: {
      type: Number,
      required: true,
      default: 0,
    },
    runAt: {
      type: Date,
      default: null,
      index: true,
    },
    nextRetryAt: {
      type: Date,
      default: null,
      index: true,
    },
    timeoutSeconds: {
      type: Number,
      default: null,
    },
    workerId: {
      type: String,
      default: null,
      index: true,
    },
    lockedAt: {
      type: Date,
      default: null,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    exitCode: {
      type: Number,
      default: null,
    },
    stdout: {
      type: String,
      default: null,
    },
    stderr: {
      type: String,
      default: null,
    },
    lastError: {
      type: String,
      default: null,
    },
    executionDurationMs: {
      type: Number,
      default: null,
    },
  },
  {
    timestamps: true, // Automatically manages createdAt and updatedAt
    _id: false, // Tell Mongoose not to generate an automatic ObjectId since we use custom string IDs
  }
);

// Compound index for claim_next_job optimization: priority DESC, runAt ASC, createdAt ASC
// And filtering by state.
jobSchema.index({ state: 1, priority: -1, runAt: 1, createdAt: 1 });

const Job = mongoose.model("Job", jobSchema);
export default Job;
