import mongoose from "mongoose";
import crypto from "crypto";

const jobAttemptSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: () => crypto.randomUUID(),
    },
    jobId: {
      type: String,
      required: true,
      ref: "Job",
      index: true,
    },
    attemptNumber: {
      type: Number,
      required: true,
    },
    workerId: {
      type: String,
      default: null,
    },
    startedAt: {
      type: Date,
      required: true,
    },
    finishedAt: {
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
    error: {
      type: String,
      default: null,
    },
    durationMs: {
      type: Number,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // only log creation time
  }
);

// Compound index to guarantee uniqueness of (jobId, attemptNumber)
jobAttemptSchema.index({ jobId: 1, attemptNumber: 1 }, { unique: true });

const JobAttempt = mongoose.model("JobAttempt", jobAttemptSchema);
export default JobAttempt;
