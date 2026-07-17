import fs from "fs";
import { spawn } from "child_process";
import path from "path";
import Worker from "../models/Worker.js";
import ConfigEntry from "../models/ConfigEntry.js";
import { isProcessAlive } from "../utils/process.js";
import { supervisorPidPath, env } from "../config/env.js";
import { DEFAULT_WORKER_STALE_TIMEOUT } from "../config/constants.js";

// Read supervisor pid file
const readPidFile = () => {
  if (!fs.existsSync(supervisorPidPath)) {
    return null;
  }
  try {
    const data = fs.readFileSync(supervisorPidPath, "utf8");
    return JSON.parse(data);
  } catch (err) {
    return null;
  }
};

export const listWorkers = async (req, res, next) => {
  try {
    const entry = await ConfigEntry.findById("worker_stale_timeout");
    const staleTimeout = entry ? parseFloat(entry.value) : DEFAULT_WORKER_STALE_TIMEOUT;

    const workers = await Worker.find({});
    const now = new Date();

    const rows = workers.map((w) => {
      const ageSeconds = (now.getTime() - w.lastHeartbeatAt.getTime()) / 1000;
      const heartbeatFresh = ageSeconds <= staleTimeout;
      const processActive = w.pid ? isProcessAlive(w.pid) : false;
      const active = w.status === "running" && heartbeatFresh && processActive;

      return {
        id: w._id,
        status: w.status,
        active: active ? "yes" : "no",
        pid: w.pid,
        current_job_id: w.currentJobId || "-",
        last_heartbeat: w.lastHeartbeatAt.toISOString(),
      };
    });

    const pidInfo = readPidFile();
    const supervisorActive = pidInfo ? isProcessAlive(pidInfo.pid) : false;

    res.status(200).json({
      supervisorActive,
      workers: rows,
    });
  } catch (error) {
    next(error);
  }
};

export const startSupervisor = async (req, res, next) => {
  try {
    const count = parseInt(req.body.count || "1", 10);

    const pidInfo = readPidFile();
    if (pidInfo && isProcessAlive(pidInfo.pid)) {
      return res.status(400).json({
        error: `A supervisor already appears to be running (pid ${pidInfo.pid}). Stop it first.`,
      });
    }

    // Determine path of supervisor.js file
    const currentFilePath = new URL(import.meta.url).pathname;
    const currentDir = path.dirname(currentFilePath);
    const supervisorScriptPath = path.resolve(currentDir, "../workers/supervisor.js");

    console.log(`[Supervisor Control] Starting supervisor with ${count} workers...`);

    // Spawn detached supervisor process
    const child = spawn(process.execPath, [supervisorScriptPath, "--count", String(count)], {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        NODE_ENV: env.NODE_ENV,
      },
    });

    child.unref(); // detach from parent event loop

    // Wait a brief moment for the PID file to be written
    let attempts = 0;
    let startedPidInfo = null;
    while (attempts < 10) {
      await new Promise((r) => setTimeout(r, 200));
      startedPidInfo = readPidFile();
      if (startedPidInfo && isProcessAlive(startedPidInfo.pid)) {
        break;
      }
      attempts++;
    }

    if (startedPidInfo) {
      res.status(200).json({
        message: "Supervisor started successfully",
        pid: startedPidInfo.pid,
        supervisorId: startedPidInfo.supervisorId,
      });
    } else {
      res.status(500).json({
        error: "Supervisor started but failed to write PID file. Check supervisor logs.",
      });
    }
  } catch (error) {
    next(error);
  }
};

export const stopSupervisor = async (req, res, next) => {
  try {
    const { force = false } = req.body;
    const pidInfo = readPidFile();

    if (!pidInfo) {
      return res.status(400).json({ error: "No supervisor is running." });
    }

    const alive = isProcessAlive(pidInfo.pid);
    if (!alive) {
      // Clean up stale file
      if (fs.existsSync(supervisorPidPath)) {
        fs.unlinkSync(supervisorPidPath);
      }
      return res.status(200).json({ message: "Supervisor was already stopped (stale PID removed)." });
    }

    console.log(`[Supervisor Control] Signaling supervisor (PID ${pidInfo.pid}) to stop (force: ${force})...`);

    const signal = force ? "SIGKILL" : "SIGTERM";
    try {
      process.kill(pidInfo.pid, signal);
    } catch (err) {
      return res.status(500).json({ error: `Failed to signal supervisor: ${err.message}` });
    }

    if (force) {
      if (fs.existsSync(supervisorPidPath)) {
        fs.unlinkSync(supervisorPidPath);
      }
      return res.status(200).json({ message: "Supervisor forcefully terminated." });
    }

    // Wait up to 5 seconds for graceful shutdown
    let attempts = 0;
    let stopped = false;
    while (attempts < 25) {
      await new Promise((r) => setTimeout(r, 200));
      if (!isProcessAlive(pidInfo.pid)) {
        stopped = true;
        break;
      }
      attempts++;
    }

    if (stopped) {
      res.status(200).json({ message: "Supervisor stopped gracefully." });
    } else {
      res.status(500).json({
        error: `Supervisor (PID ${pidInfo.pid}) did not stop gracefully. Retry with force: true to kill it.`,
      });
    }
  } catch (error) {
    next(error);
  }
};

export const getSupervisorStatus = async (req, res, next) => {
  try {
    const pidInfo = readPidFile();
    const active = pidInfo ? isProcessAlive(pidInfo.pid) : false;

    res.status(200).json({
      active,
      pid: active ? pidInfo.pid : null,
      supervisorId: active ? pidInfo.supervisorId : null,
      workerCount: active ? pidInfo.workerCount : 0,
      startedAt: active ? pidInfo.startedAt : null,
    });
  } catch (error) {
    next(error);
  }
};
