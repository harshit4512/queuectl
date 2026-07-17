#!/usr/bin/env node

import { Command } from "commander";
import pc from "picocolors";
import Table from "cli-table3";
import mongoose from "mongoose";
import fs from "fs";
import { spawn } from "child_process";
import path from "url";
import os from "os";

import { connectDB, disconnectDB } from "../src/config/db.js";
import Job from "../src/models/Job.js";
import JobAttempt from "../src/models/JobAttempt.js";
import Worker from "../src/models/Worker.js";
import ConfigEntry from "../src/models/ConfigEntry.js";
import { serializeCommand, deserializeCommand } from "../src/utils/commandParser.js";
import { decideRetry } from "../src/services/retryService.js";
import { isProcessAlive } from "../src/utils/process.js";
import { supervisorPidPath, env } from "../src/config/env.js";
import {
  cliKeyToInternal,
  internalKeyToCli,
  validateConfigValue,
} from "../src/controllers/configController.js";

const program = new Command();
program
  .name("queuectl")
  .description("A production-grade CLI background job queue system (MERN Port).")
  .version("0.1.0");

// Helper to connect DB for CLI commands
async function runWithDB(action) {
  try {
    await connectDB();
    await action();
  } catch (err) {
    console.error(pc.red(`Error: ${err.message}`));
    process.exit(1);
  } finally {
    await disconnectDB();
  }
}

// ------------------------------------------------------------------
// ENQUEUE Command
// ------------------------------------------------------------------
program
  .command("enqueue")
  .description("Enqueue a new job, either as a JSON payload or via flags.")
  .argument("[payload]", "JSON payload, e.g. '{\"id\":\"job1\",\"command\":\"echo hi\"}'")
  .option("--id <id>", "Job ID")
  .option("--command <cmd>", "Command to run")
  .option("--max-retries <retries>", "Max retries", "3")
  .option("--timeout <timeout>", "Job execution timeout in seconds")
  .option("--priority <priority>", "Job priority", "0")
  .option("--run-at <timestamp>", "ISO 8601 timestamp for a delayed job")
  .option("--shell", "Execute via shell", false)
  .action(async (payload, options) => {
    await runWithDB(async () => {
      let jobData = {};

      if (payload) {
        try {
          jobData = JSON.parse(payload);
        } catch (err) {
          throw new Error(`Invalid JSON payload: ${err.message}`);
        }
      } else {
        if (!options.id || !options.command) {
          throw new Error("Provide either a JSON payload or both --id and --command");
        }
        jobData = {
          id: options.id,
          command: options.command,
          max_retries: parseInt(options.maxRetries, 10),
          timeout: options.timeout ? parseInt(options.timeout, 10) : null,
          priority: parseInt(options.priority, 10),
          run_at: options.runAt || null,
          shell: options.shell,
        };
      }

      // Validations
      if (!jobData.id || !jobData.command) {
        throw new Error("Missing required fields: id, command");
      }
      if (!/^[A-Za-z0-9_\-]+$/.test(jobData.id)) {
        throw new Error("Job id must contain only letters, digits, underscores, and hyphens");
      }

      const exists = await Job.findById(jobData.id);
      if (exists) {
        throw new Error(`Job with id '${jobData.id}' already exists`);
      }

      const serializedCmd = serializeCommand(jobData.command, jobData.shell);

      const job = new Job({
        _id: jobData.id,
        command: serializedCmd,
        isShell: !!jobData.shell,
        maxRetries: jobData.max_retries !== undefined ? jobData.max_retries : 3,
        timeoutSeconds: jobData.timeout || null,
        priority: jobData.priority || 0,
        runAt: jobData.run_at ? new Date(jobData.run_at) : null,
        state: "pending",
      });

      await job.save();
      console.log(`${pc.green("Enqueued")} job ${pc.cyan(job._id)}`);
    });
  });

// ------------------------------------------------------------------
// STATUS Command
// ------------------------------------------------------------------
program
  .command("status")
  .description("Show a summary of queue and worker status.")
  .action(async () => {
    await runWithDB(async () => {
      const aggregates = await Job.aggregate([
        { $group: { _id: "$state", count: { $sum: 1 } } },
      ]);
      const counts = { pending: 0, processing: 0, completed: 0, failed: 0, dead: 0 };
      for (const group of aggregates) {
        if (group._id in counts) counts[group._id] = group.count;
      }

      const now = new Date();
      const allJobs = await Job.find({});
      const total = allJobs.length;
      const delayed = allJobs.filter((j) => j.runAt && j.runAt > now).length;
      const waitingRetry = allJobs.filter((j) => j.state === "failed" && j.nextRetryAt && j.nextRetryAt > now).length;

      const ready = allJobs.filter((j) => {
        const isClaimable = j.state === "pending" || j.state === "failed";
        const runEligible = !j.runAt || j.runAt <= now;
        const retryEligible = !j.nextRetryAt || j.nextRetryAt <= now;
        return isClaimable && runEligible && retryEligible;
      }).length;

      const staleTimeoutEntry = await ConfigEntry.findById("worker_stale_timeout");
      const staleTimeout = staleTimeoutEntry ? parseFloat(staleTimeoutEntry.value) : 15.0;

      const workers = await Worker.find({});
      const activeWorkers = workers.filter((w) => {
        const fresh = (now.getTime() - w.lastHeartbeatAt.getTime()) / 1000 <= staleTimeout;
        const alive = w.pid ? isProcessAlive(w.pid) : false;
        return w.status === "running" && fresh && alive;
      });

      const staleWorkers = workers.length - activeWorkers.length;

      const table = new Table({
        head: [pc.cyan("Metric"), pc.cyan("Count")],
        chars: { mid: "", "left-mid": "", "mid-mid": "", "right-mid": "" },
      });

      table.push(
        ["Pending", counts.pending],
        ["Processing", counts.processing],
        ["Completed", counts.completed],
        ["Failed (awaiting retry)", counts.failed],
        ["Dead (DLQ)", counts.dead],
        ["Total jobs", total],
        ["", ""],
        ["Queue-ready jobs", ready],
        ["Delayed jobs (run_at in future)", delayed],
        ["Jobs waiting for retry", waitingRetry],
        ["", ""],
        ["Active workers", activeWorkers.length],
        ["Stale/inactive workers", staleWorkers]
      );

      console.log(pc.bold("\nQueueCTL Status"));
      console.log(table.toString());
    });
  });

// ------------------------------------------------------------------
// LIST Command
// ------------------------------------------------------------------
program
  .command("list")
  .description("List jobs, optionally filtered and sorted.")
  .option("--state <state>", "Filter by job state")
  .option("--sort <sort>", "newest|oldest|attempts", "newest")
  .option("--limit <limit>", "Limit result count")
  .option("--json", "Output as JSON", false)
  .action(async (options) => {
    await runWithDB(async () => {
      const query = {};
      if (options.state) query.state = options.state;

      let queryBuilder = Job.find(query);
      if (options.sort === "newest") queryBuilder = queryBuilder.sort({ createdAt: -1 });
      else if (options.sort === "oldest") queryBuilder = queryBuilder.sort({ createdAt: 1 });
      else if (options.sort === "attempts") queryBuilder = queryBuilder.sort({ attempts: -1 });
      else throw new Error(`Unknown sort mode: '${options.sort}'`);

      if (options.limit) {
        const l = parseInt(options.limit, 10);
        if (!isNaN(l)) queryBuilder = queryBuilder.limit(l);
      }

      const jobs = await queryBuilder;

      if (options.json) {
        console.log(JSON.stringify(jobs.map((j) => ({
          id: j._id,
          state: j.state,
          attempts: j.attempts,
          max_retries: j.maxRetries,
          priority: j.priority,
          worker_id: j.workerId,
          created_at: j.createdAt.toISOString(),
          next_retry_at: j.nextRetryAt ? j.nextRetryAt.toISOString() : null,
          exit_code: j.exitCode,
        })), null, 2));
        return;
      }

      const table = new Table({
        head: ["ID", "State", "Attempts", "Max Retries", "Priority", "Worker", "Created", "Next Retry", "Exit"].map((h) => pc.cyan(h)),
      });

      for (const j of jobs) {
        table.push([
          j._id,
          j.state,
          j.attempts,
          j.maxRetries,
          j.priority,
          j.workerId || "-",
          j.createdAt.toISOString(),
          j.nextRetryAt ? j.nextRetryAt.toISOString() : "-",
          j.exitCode !== null && j.exitCode !== undefined ? j.exitCode : "-",
        ]);
      }

      console.log(table.toString());
    });
  });

// ------------------------------------------------------------------
// SHOW Command
// ------------------------------------------------------------------
program
  .command("show")
  .description("Show full details for a single job, including attempt history.")
  .argument("<job_id>", "Job ID")
  .action(async (jobId) => {
    await runWithDB(async () => {
      const job = await Job.findById(jobId);
      if (!job) {
        throw new Error(`No job with id '${jobId}'`);
      }

      const history = await JobAttempt.find({ jobId }).sort({ attemptNumber: 1 });

      console.log(`\n${pc.bold(pc.cyan("Job:"))} ${job._id}`);
      console.log(`${pc.bold("State:")} ${job.state}`);
      console.log(`${pc.bold("Command:")} ${job.command.join(" ")}`);
      console.log(`${pc.bold("Attempts:")} ${job.attempts} / ${1 + job.maxRetries} max`);
      console.log(`${pc.bold("Priority:")} ${job.priority}`);
      console.log(`${pc.bold("Created:")} ${job.createdAt.toISOString()}`);
      console.log(`${pc.bold("Updated:")} ${job.updatedAt.toISOString()}`);
      if (job.startedAt) console.log(`${pc.bold("Started:")} ${job.startedAt.toISOString()}`);
      if (job.completedAt) console.log(`${pc.bold("Completed:")} ${job.completedAt.toISOString()}`);
      if (job.nextRetryAt) console.log(`${pc.bold("Next retry:")} ${job.nextRetryAt.toISOString()}`);
      if (job.exitCode !== null) console.log(`${pc.bold("Exit code:")} ${job.exitCode}`);
      if (job.lastError) console.log(`${pc.bold(pc.red("Last error:"))} ${job.lastError}`);
      if (job.stdout) {
        console.log(`\n${pc.bold("stdout:")}`);
        console.log(job.stdout);
      }
      if (job.stderr) {
        console.log(`\n${pc.bold("stderr:")}`);
        console.log(job.stderr);
      }

      if (history.length > 0) {
        console.log(pc.bold("\nAttempt History:"));
        const table = new Table({
          head: ["#", "Worker", "Started", "Finished", "Exit", "Duration (ms)", "Error"].map((h) => pc.cyan(h)),
        });
        for (const a of history) {
          table.push([
            a.attemptNumber,
            a.workerId || "-",
            a.startedAt.toISOString(),
            a.finishedAt ? a.finishedAt.toISOString() : "-",
            a.exitCode !== null && a.exitCode !== undefined ? a.exitCode : "-",
            a.durationMs !== null && a.durationMs !== undefined ? a.durationMs : "-",
            a.error ? a.error.substring(0, 60) : "-",
          ]);
        }
        console.log(table.toString());
      }
    });
  });

// ------------------------------------------------------------------
// CONFIG Subcommands
// ------------------------------------------------------------------
const configCmd = program.command("config").description("Manage QueueCTL configuration");

configCmd
  .command("list")
  .description("List all configuration variables.")
  .action(async () => {
    await runWithDB(async () => {
      const entries = await ConfigEntry.find({});
      const table = new Table({ head: ["Key", "Value"].map((h) => pc.cyan(h)) });

      const keys = [
        "max_retries",
        "backoff_base",
        "worker_poll_interval",
        "worker_heartbeat_interval",
        "worker_stale_timeout",
        "job_lock_timeout",
        "shutdown_timeout",
        "default_job_timeout",
      ];
      const defaults = {
        max_retries: "3",
        backoff_base: "2.0",
        worker_poll_interval: "1.0",
        worker_heartbeat_interval: "2.0",
        worker_stale_timeout: "15.0",
        job_lock_timeout: "30.0",
        shutdown_timeout: "30.0",
        default_job_timeout: "300",
      };

      for (const key of keys) {
        const found = entries.find((e) => e._id === key);
        const val = found ? found.value : defaults[key];
        table.push([internalKeyToCli(key), val]);
      }
      console.log(table.toString());
    });
  });

configCmd
  .command("get")
  .description("Get a config value.")
  .argument("<key>", "Config key")
  .action(async (key) => {
    await runWithDB(async () => {
      const internalKey = cliKeyToInternal(key);
      const defaults = {
        max_retries: "3",
        backoff_base: "2.0",
        worker_poll_interval: "1.0",
        worker_heartbeat_interval: "2.0",
        worker_stale_timeout: "15.0",
        job_lock_timeout: "30.0",
        shutdown_timeout: "30.0",
        default_job_timeout: "300",
      };

      if (!defaults[internalKey]) {
        throw new Error(`Unknown configuration key '${key}'`);
      }

      const entry = await ConfigEntry.findById(internalKey);
      console.log(entry ? entry.value : defaults[internalKey]);
    });
  });

configCmd
  .command("set")
  .description("Set a config value.")
  .argument("<key>", "Config key")
  .argument("<value>", "Config value")
  .action(async (key, value) => {
    await runWithDB(async () => {
      const internalKey = cliKeyToInternal(key);
      const canonical = validateConfigValue(internalKey, value);

      await ConfigEntry.findOneAndUpdate(
        { _id: internalKey },
        { value: canonical },
        { upsert: true }
      );
      console.log(`${pc.green(key)} = ${canonical}`);
    });
  });

configCmd
  .command("reset")
  .description("Reset configuration variables to defaults.")
  .action(async () => {
    await runWithDB(async () => {
      const defaults = {
        max_retries: "3",
        backoff_base: "2.0",
        worker_poll_interval: "1.0",
        worker_heartbeat_interval: "2.0",
        worker_stale_timeout: "15.0",
        job_lock_timeout: "30.0",
        shutdown_timeout: "30.0",
        default_job_timeout: "300",
      };

      for (const [k, v] of Object.entries(defaults)) {
        await ConfigEntry.findOneAndUpdate({ _id: k }, { value: v }, { upsert: true });
      }
      console.log(pc.green("Configuration reset to defaults."));
    });
  });

// ------------------------------------------------------------------
// DLQ Subcommands
// ------------------------------------------------------------------
const dlqCmd = program.command("dlq").description("Dead Letter Queue operations");

dlqCmd
  .command("list")
  .description("List all dead jobs.")
  .action(async () => {
    await runWithDB(async () => {
      const deadJobs = await Job.find({ state: "dead" }).sort({ updatedAt: -1 });

      if (deadJobs.length === 0) {
        console.log(pc.dim("DLQ is empty."));
        return;
      }

      const table = new Table({
        head: ["ID", "Attempts", "Last Error", "Updated"].map((h) => pc.red(h)),
      });

      for (const j of deadJobs) {
        table.push([j._id, j.attempts, (j.lastError || "").substring(0, 60), j.updatedAt.toISOString()]);
      }
      console.log(table.toString());
    });
  });

dlqCmd
  .command("retry")
  .description("Retry a dead job (moves back to pending).")
  .argument("<job_id>", "Job ID")
  .action(async (jobId) => {
    await runWithDB(async () => {
      const job = await Job.findById(jobId);
      if (!job) throw new Error(`No job with id '${jobId}'`);
      if (job.state !== "dead") throw new Error(`Job '${jobId}' is not dead (current state: ${job.state}); only dead jobs can be DLQ-retried`);

      job.state = "pending";
      job.workerId = null;
      job.lockedAt = null;
      job.nextRetryAt = null;
      job.exitCode = null;
      job.completedAt = null;
      job.lastError = null;
      job.updatedAt = new Date();

      await job.save();
      console.log(pc.green(`Job '${jobId}' moved back to pending.`));
    });
  });

dlqCmd
  .command("purge")
  .description("Permanently delete all dead jobs.")
  .option("--yes", "Skip confirmation", false)
  .action(async (options) => {
    await runWithDB(async () => {
      const result = await Job.deleteMany({ state: "dead" });
      console.log(pc.green(`Purged ${result.deletedCount} dead job(s).`));
    });
  });

// ------------------------------------------------------------------
// WORKER Subcommands
// ------------------------------------------------------------------
const workerCmd = program.command("worker").description("Manage worker processes");

workerCmd
  .command("start")
  .description("Start the supervisor and its worker pool.")
  .option("-c, --count <count>", "Number of worker processes", "1")
  .option("--foreground", "Run in the foreground (blocking)", false)
  .action(async (options) => {
    const count = parseInt(options.count, 10);
    const foreground = options.foreground;

    const pidInfo = (() => {
      if (!fs.existsSync(supervisorPidPath)) return null;
      try {
        return JSON.parse(fs.readFileSync(supervisorPidPath, "utf8"));
      } catch (err) {
        return null;
      }
    })();

    if (pidInfo && isProcessAlive(pidInfo.pid)) {
      console.error(pc.red(`Error: A supervisor already appears to be running (pid ${pidInfo.pid}). Use 'worker stop' first.`));
      process.exit(1);
    }

    const currentFileUrl = import.meta.url;
    const currentFilePath = path.fileURLToPath(currentFileUrl);
    const supervisorScriptPath = path.resolve(path.dirname(currentFilePath), "../src/workers/supervisor.js");

    if (foreground) {
      console.log(pc.bold(pc.cyan("Starting supervisor")) + ` with ${count} worker(s) in the foreground. Press Ctrl+C to stop.`);
      const child = spawn(process.execPath, [supervisorScriptPath, "--count", String(count)], {
        stdio: "inherit",
      });
      child.on("exit", (code) => process.exit(code || 0));
      return;
    }

    // Detached background run
    console.log(pc.bold(pc.cyan("Starting supervisor")) + ` with ${count} worker(s) in background...`);
    const child = spawn(process.execPath, [supervisorScriptPath, "--count", String(count)], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();

    // Poll for PID file creation
    let attempts = 0;
    let started = false;
    let newPidInfo = null;
    while (attempts < 10) {
      await new Promise((r) => setTimeout(r, 200));
      if (fs.existsSync(supervisorPidPath)) {
        try {
          newPidInfo = JSON.parse(fs.readFileSync(supervisorPidPath, "utf8"));
          if (isProcessAlive(newPidInfo.pid)) {
            started = true;
            break;
          }
        } catch (err) {}
      }
      attempts++;
    }

    if (started && newPidInfo) {
      console.log(pc.green(`Started supervisor (pid ${newPidInfo.pid}) with ${count} worker(s).`));
    } else {
      console.error(pc.red("Error: Detached supervisor failed to start or write PID file. Check log files."));
      process.exit(1);
    }
  });

workerCmd
  .command("stop")
  .description("Stop the running supervisor and its workers, gracefully by default.")
  .option("--force", "Terminate immediately", false)
  .action(async (options) => {
    const force = options.force;
    const pidInfo = (() => {
      if (!fs.existsSync(supervisorPidPath)) return null;
      try {
        return JSON.parse(fs.readFileSync(supervisorPidPath, "utf8"));
      } catch (err) {
        return null;
      }
    })();

    if (!pidInfo) {
      console.error(pc.red("Error: No supervisor PID file found; is a supervisor running?"));
      process.exit(1);
    }

    const alive = isProcessAlive(pidInfo.pid);
    if (!alive) {
      if (fs.existsSync(supervisorPidPath)) fs.unlinkSync(supervisorPidPath);
      console.log(pc.yellow("Supervisor was already stopped (stale PID file cleaned up)."));
      return;
    }

    const signal = force ? "SIGKILL" : "SIGTERM";
    try {
      process.kill(pidInfo.pid, signal);
    } catch (err) {
      console.error(pc.red(`Error signaling supervisor process ${pidInfo.pid}: ${err.message}`));
      process.exit(1);
    }

    if (force) {
      if (fs.existsSync(supervisorPidPath)) fs.unlinkSync(supervisorPidPath);
      console.log(pc.green("Supervisor forcefully stopped."));
      return;
    }

    console.log(pc.cyan(`Waiting for supervisor (PID ${pidInfo.pid}) to stop gracefully...`));
    let attempts = 0;
    let stopped = false;
    while (attempts < 50) {
      await new Promise((r) => setTimeout(r, 200));
      if (!isProcessAlive(pidInfo.pid)) {
        stopped = true;
        break;
      }
      attempts++;
    }

    if (stopped) {
      console.log(pc.green("Supervisor stopped gracefully."));
    } else {
      console.error(pc.red(`Error: Supervisor (pid ${pidInfo.pid}) did not stop within timeout. Retry with --force.`));
      process.exit(1);
    }
  });

workerCmd
  .command("list")
  .description("List known workers and whether they are currently active.")
  .action(async () => {
    await runWithDB(async () => {
      const entries = await ConfigEntry.findById("worker_stale_timeout");
      const staleTimeout = entries ? parseFloat(entries.value) : 15.0;

      const workers = await Worker.find({});
      const now = new Date();

      const pidInfo = (() => {
        if (!fs.existsSync(supervisorPidPath)) return null;
        try {
          return JSON.parse(fs.readFileSync(supervisorPidPath, "utf8"));
        } catch (err) {
          return null;
        }
      })();

      if (!pidInfo || !isProcessAlive(pidInfo.pid)) {
        console.log(pc.dim("No supervisor is currently running."));
      }

      if (workers.length === 0) {
        console.log(pc.dim("No worker records found."));
        return;
      }

      const table = new Table({
        head: ["ID", "Status", "Active", "PID", "Current Job", "Last Heartbeat"].map((h) => pc.cyan(h)),
      });

      for (const w of workers) {
        const ageSeconds = (now.getTime() - w.lastHeartbeatAt.getTime()) / 1000;
        const fresh = ageSeconds <= staleTimeout;
        const alive = w.pid ? isProcessAlive(w.pid) : false;
        const active = w.status === "running" && fresh && alive;

        table.push([
          w._id,
          w.status,
          active ? "yes" : "no",
          w.pid,
          w.currentJobId || "-",
          w.lastHeartbeatAt.toISOString(),
        ]);
      }
      console.log(table.toString());
    });
  });

program.parse(process.argv);
