import { fork } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import mongoose from "mongoose";
import { Command } from "commander";

import { connectDB } from "../config/db.js";
import { env, supervisorPidPath } from "../config/env.js";
import ConfigEntry from "../models/ConfigEntry.js";
import Worker from "../models/Worker.js";
import { recoverStaleJobs } from "../services/recoveryService.js";
import {
  DEFAULT_MAX_RETRIES,
  DEFAULT_BACKOFF_BASE,
  DEFAULT_WORKER_POLL_INTERVAL,
  DEFAULT_WORKER_HEARTBEAT_INTERVAL,
  DEFAULT_WORKER_STALE_TIMEOUT,
  DEFAULT_JOB_LOCK_TIMEOUT,
  DEFAULT_SHUTDOWN_TIMEOUT,
  DEFAULT_JOB_TIMEOUT,
} from "../config/constants.js";

const DEFAULTS = {
  max_retries: String(DEFAULT_MAX_RETRIES),
  backoff_base: String(DEFAULT_BACKOFF_BASE),
  worker_poll_interval: String(DEFAULT_WORKER_POLL_INTERVAL),
  worker_heartbeat_interval: String(DEFAULT_WORKER_HEARTBEAT_INTERVAL),
  worker_stale_timeout: String(DEFAULT_WORKER_STALE_TIMEOUT),
  job_lock_timeout: String(DEFAULT_JOB_LOCK_TIMEOUT),
  shutdown_timeout: String(DEFAULT_SHUTDOWN_TIMEOUT),
  default_job_timeout: String(DEFAULT_JOB_TIMEOUT),
};

// Ensure configuration defaults exist in DB
async function ensureDefaults() {
  for (const [key, value] of Object.entries(DEFAULTS)) {
    const exists = await ConfigEntry.findById(key);
    if (!exists) {
      const entry = new ConfigEntry({ _id: key, value });
      await entry.save();
    }
  }
}

// Get config float helper
async function getConfigFloat(key, defaultValue) {
  const entry = await ConfigEntry.findById(key);
  return entry ? parseFloat(entry.value) : defaultValue;
}

const supervisorId = crypto.randomUUID();
const workersMap = new Map(); // workerId -> ChildProcess
let shutdownRequested = false;
let recoveryIntervalTimer = null;
let shutdownTimeoutTimer = null;

async function writePidFile(count) {
  const contents = {
    pid: process.pid,
    supervisorId,
    workerCount: count,
    startedAt: new Date().toISOString(),
  };
  const dir = path.dirname(supervisorPidPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(supervisorPidPath, JSON.stringify(contents, null, 2), "utf8");
}

function cleanupPidFile() {
  if (fs.existsSync(supervisorPidPath)) {
    try {
      fs.unlinkSync(supervisorPidPath);
    } catch (err) {
      // ignore
    }
  }
}

async function runRecovery() {
  try {
    const jobLockTimeout = await getConfigFloat("job_lock_timeout", DEFAULT_JOB_LOCK_TIMEOUT);
    const backoffBase = await getConfigFloat("backoff_base", DEFAULT_BACKOFF_BASE);
    const recovered = await recoverStaleJobs(jobLockTimeout, backoffBase);
    for (const job of recovered) {
      console.log(`[Supervisor] Stale job recovered: ${job.jobId} (movedToDead: ${job.movedToDead})`);
    }
  } catch (err) {
    console.error("[Supervisor] Stale-job recovery failed:", err.message);
  }
}

async function spawnWorker(index, pollInterval, heartbeatInterval, backoffBase) {
  const workerId = `${supervisorId.substring(0, 8)}-w${index}`;
  console.log(`[Supervisor] Spawning worker ${workerId}...`);

  const childEnv = {
    ...process.env,
    WORKER_ID: workerId,
    SUPERVISOR_ID: supervisorId,
    POLL_INTERVAL: String(pollInterval),
    HEARTBEAT_INTERVAL: String(heartbeatInterval),
    BACKOFF_BASE: String(backoffBase),
  };

  const currentFilePath = new URL(import.meta.url).pathname;
  const currentDir = path.dirname(currentFilePath);
  // Correctly handle Windows backslashes in path resolution
  const workerScriptPath = path.resolve(currentDir, "worker.js");

  const child = fork(workerScriptPath, [], {
    env: childEnv,
    stdio: "inherit",
  });

  workersMap.set(workerId, child);

  child.on("exit", (code, signal) => {
    workersMap.delete(workerId);
    if (!shutdownRequested) {
      console.warn(`[Supervisor] Worker ${workerId} exited unexpectedly with code ${code} / signal ${signal}. Respawning...`);
      // Update crashed status in DB
      Worker.updateOne({ _id: workerId }, { status: "crashed" }).catch(() => {});
      // Respawn
      spawnWorker(index, pollInterval, heartbeatInterval, backoffBase).catch((err) => {
        console.error(`[Supervisor] Failed to respawn worker ${index}:`, err.message);
      });
    } else {
      console.log(`[Supervisor] Worker ${workerId} exited (shutdown mode).`);
    }
  });

  return workerId;
}

async function gracefulShutdown(shutdownTimeout) {
  if (shutdownRequested) return;
  shutdownRequested = true;
  console.log("[Supervisor] Initiating graceful shutdown...");

  if (recoveryIntervalTimer) clearInterval(recoveryIntervalTimer);

  // Send IPC shutdown message to all workers
  for (const [workerId, child] of workersMap.entries()) {
    if (child.connected) {
      console.log(`[Supervisor] Sending shutdown command to worker ${workerId}...`);
      child.send("shutdown");
    }
  }

  // Force-kill timeout
  shutdownTimeoutTimer = setTimeout(async () => {
    console.warn(`[Supervisor] Graceful shutdown deadline exceeded. Force-terminating remaining workers...`);
    for (const [workerId, child] of workersMap.entries()) {
      console.log(`[Supervisor] Terminating worker ${workerId}...`);
      child.kill("SIGKILL");
    }

    await markAllStopped();
    cleanupPidFile();
    await mongoose.disconnect();
    console.log("[Supervisor] Supervisor stopped (force shut down).");
    process.exit(1);
  }, shutdownTimeout * 1000);

  // Check if all workers exited
  const checkExit = setInterval(async () => {
    if (workersMap.size === 0) {
      clearInterval(checkExit);
      clearTimeout(shutdownTimeoutTimer);

      await markAllStopped();
      cleanupPidFile();
      await mongoose.disconnect();
      console.log("[Supervisor] All workers stopped. Supervisor exited gracefully.");
      process.exit(0);
    }
  }, 200);
}

async function markAllStopped() {
  try {
    await Worker.updateMany(
      { supervisorId },
      {
        status: "stopped",
        stoppedAt: new Date(),
        currentJobId: null,
      }
    );
  } catch (err) {
    console.error("[Supervisor] Failed to update final status of workers in DB:", err.message);
  }
}

async function main() {
  const program = new Command();
  program
    .option("-c, --count <count>", "Number of workers to start", "1")
    .parse(process.argv);

  const options = program.opts();
  const workerCount = parseInt(options.count, 10);

  await connectDB();
  await ensureDefaults();

  console.log(`[Supervisor] Starting supervisor ${supervisorId} with ${workerCount} workers...`);
  await writePidFile(workerCount);

  // Run initial recovery pass
  await runRecovery();

  const pollInterval = await getConfigFloat("worker_poll_interval", DEFAULT_WORKER_POLL_INTERVAL);
  const heartbeatInterval = await getConfigFloat("worker_heartbeat_interval", DEFAULT_WORKER_HEARTBEAT_INTERVAL);
  const backoffBase = await getConfigFloat("backoff_base", DEFAULT_BACKOFF_BASE);
  const shutdownTimeout = await getConfigFloat("shutdown_timeout", DEFAULT_SHUTDOWN_TIMEOUT);

  // Start periodic recovery check (every 5 seconds)
  recoveryIntervalTimer = setInterval(runRecovery, 5000);

  // Install signal handlers
  process.on("SIGINT", () => gracefulShutdown(shutdownTimeout));
  process.on("SIGTERM", () => gracefulShutdown(shutdownTimeout));

  // Spawn initial worker pool
  for (let i = 0; i < workerCount; i++) {
    await spawnWorker(i, pollInterval, heartbeatInterval, backoffBase);
  }

  console.log(`[Supervisor] Supervisor process running (PID ${process.pid}).`);
}

main().catch((err) => {
  console.error("Fatal Supervisor error:", err);
  cleanupPidFile();
  process.exit(1);
});
