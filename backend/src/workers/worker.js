import mongoose from "mongoose";
import os from "os";
import { connectDB } from "../config/db.js";
import Worker from "../models/Worker.js";
import Job from "../models/Job.js";
import JobAttempt from "../models/JobAttempt.js";
import { executeCommand } from "../services/executionService.js";
import { decideRetry } from "../services/retryService.js";

const workerId = process.env.WORKER_ID;
const supervisorId = process.env.SUPERVISOR_ID;
const pollInterval = parseFloat(process.env.POLL_INTERVAL || "1.0");
const heartbeatInterval = parseFloat(process.env.HEARTBEAT_INTERVAL || "2.0");
const backoffBase = parseFloat(process.env.BACKOFF_BASE || "2.0");

if (!workerId || !supervisorId) {
  console.error("❌ Worker started without WORKER_ID or SUPERVISOR_ID environment variables.");
  process.exit(1);
}

let shutdownRequested = false;
let currentJobId = null;
let heartbeatTimer = null;

async function registerWorker() {
  await Worker.findOneAndUpdate(
    { _id: workerId },
    {
      supervisorId,
      pid: process.pid,
      status: "running",
      hostname: os.hostname(),
      startedAt: new Date(),
      lastHeartbeatAt: new Date(),
      currentJobId: null,
      stoppedAt: null,
    },
    { upsert: true, new: true }
  );
}

async function sendHeartbeat() {
  try {
    await Worker.updateOne(
      { _id: workerId },
      {
        lastHeartbeatAt: new Date(),
        currentJobId,
      }
    );
  } catch (err) {
    console.error(`[Worker ${workerId}] Heartbeat failed:`, err.message);
  }
}

async function markStopped() {
  try {
    await Worker.updateOne(
      { _id: workerId },
      {
        status: "stopped",
        stoppedAt: new Date(),
        currentJobId: null,
      }
    );
  } catch (err) {
    console.error(`[Worker ${workerId}] Mark stopped failed:`, err.message);
  }
}

async function claimNextJob() {
  const now = new Date();
  // Atomic claim using findOneAndUpdate
  return await Job.findOneAndUpdate(
    {
      state: { $in: ["pending", "failed"] },
      $and: [
        { $or: [{ runAt: { $exists: false } }, { runAt: null }, { runAt: { $lte: now } }] },
        { $or: [{ nextRetryAt: { $exists: false } }, { nextRetryAt: null }, { nextRetryAt: { $lte: now } }] },
      ],
    },
    {
      $set: {
        state: "processing",
        workerId: workerId,
        lockedAt: now,
        startedAt: now,
        updatedAt: now,
      },
      $inc: { attempts: 1 },
    },
    {
      sort: { priority: -1, runAt: 1, createdAt: 1 },
      new: true,
    }
  );
}

// Graceful sleep helper
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function workerLoop() {
  await connectDB();
  await registerWorker();
  console.log(`👷 Worker ${workerId} registered and listening for jobs...`);

  // Start heartbeat interval
  heartbeatTimer = setInterval(sendHeartbeat, heartbeatInterval * 1000);

  while (!shutdownRequested) {
    let job = null;
    try {
      job = await claimNextJob();
    } catch (err) {
      console.error(`[Worker ${workerId}] Error claiming job:`, err.message);
      await sleep(pollInterval * 1000);
      continue;
    }

    if (!job) {
      // Sleep responsively
      await sleep(pollInterval * 1000);
      continue;
    }

    // Set current job ID for heartbeat tracking
    currentJobId = job._id;
    console.log(`[Worker ${workerId}] Claimed job ${job._id} (Attempt ${job.attempts})`);

    // Run execution (does not hold any database locks or transactions)
    const result = await executeCommand(job.command, job.isShell, job.timeoutSeconds);

    try {
      // Record attempt
      const attempt = new JobAttempt({
        jobId: job._id,
        attemptNumber: job.attempts,
        workerId: workerId,
        startedAt: result.startedAt,
        finishedAt: result.finishedAt,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        error: result.error,
        durationMs: result.durationMs,
      });
      await attempt.save();

      // Refresh job document to modify state
      const freshJob = await Job.findById(job._id);
      if (freshJob) {
        if (result.success) {
          freshJob.state = "completed";
          freshJob.exitCode = result.exitCode ?? 0;
          freshJob.stdout = result.stdout;
          freshJob.stderr = result.stderr;
          freshJob.executionDurationMs = result.durationMs;
          freshJob.completedAt = result.finishedAt;
          freshJob.workerId = null;
          freshJob.lockedAt = null;
        } else {
          // Check retry policy
          const decision = decideRetry(freshJob.attempts, freshJob.maxRetries, backoffBase);
          freshJob.state = decision.shouldRetry ? "failed" : "dead";
          freshJob.exitCode = result.exitCode;
          freshJob.stdout = result.stdout;
          freshJob.stderr = result.stderr;
          freshJob.lastError = result.error;
          freshJob.executionDurationMs = result.durationMs;
          freshJob.nextRetryAt = decision.nextRetryAt;
          freshJob.workerId = null;
          freshJob.lockedAt = null;
        }
        freshJob.updatedAt = new Date();
        await freshJob.save();
      }
    } catch (err) {
      console.error(`[Worker ${workerId}] Error saving execution outcome for ${job._id}:`, err.message);
    }

    currentJobId = null;
  }

  // Cleanup
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  await markStopped();
  await mongoose.disconnect();
  console.log(`[Worker ${workerId}] Stopped gracefully.`);
  process.exit(0);
}

// Handle parent message IPC (for instant graceful shutdown)
process.on("message", (msg) => {
  if (msg === "shutdown") {
    console.log(`[Worker ${workerId}] Graceful shutdown requested via IPC.`);
    shutdownRequested = true;
  }
});

// Fallback signal handler
process.on("SIGINT", () => {
  shutdownRequested = true;
});
process.on("SIGTERM", () => {
  shutdownRequested = true;
});

workerLoop().catch((err) => {
  console.error("Fatal worker error:", err);
  process.exit(1);
});
