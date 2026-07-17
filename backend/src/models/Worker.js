import mongoose from "mongoose";

const workerSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      required: true,
    },
    supervisorId: {
      type: String,
      required: true,
      index: true,
    },
    pid: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["starting", "running", "stopping", "stopped", "crashed"],
      default: "starting",
      required: true,
      index: true,
    },
    hostname: {
      type: String,
      required: true,
    },
    startedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    lastHeartbeatAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    stoppedAt: {
      type: Date,
      default: null,
    },
    currentJobId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: false,
    _id: false, // Custom string ID representing worker ID
  }
);

const Worker = mongoose.model("Worker", workerSchema);
export default Worker;
