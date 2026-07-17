import Job from "../models/Job.js";
import JobAttempt from "../models/JobAttempt.js";
import { serializeCommand } from "../utils/commandParser.js";

export const enqueue = async (req, res, next) => {
  try {
    const { id, command, max_retries, timeout, priority, run_at, shell } = req.body;

    // Check if job with this ID already exists
    const exists = await Job.findById(id);
    if (exists) {
      return res.status(409).json({ error: `Job with id '${id}' already exists` });
    }

    // Normalize command to string array
    let serializedCmd;
    try {
      serializedCmd = serializeCommand(command, shell);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const job = new Job({
      _id: id,
      command: serializedCmd,
      isShell: shell,
      maxRetries: max_retries,
      timeoutSeconds: timeout,
      priority,
      runAt: run_at ? new Date(run_at) : null,
      state: "pending",
    });

    await job.save();

    res.status(201).json({
      id: job._id,
      command: job.command,
      isShell: job.isShell,
      state: job.state,
      attempts: job.attempts,
      maxRetries: job.maxRetries,
      priority: job.priority,
      runAt: job.runAt,
      timeoutSeconds: job.timeoutSeconds,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    });
  } catch (error) {
    next(error);
  }
};

export const listJobs = async (req, res, next) => {
  try {
    const { state, sort = "newest", limit } = req.query;

    const query = {};
    if (state) {
      query.state = state;
    }

    let queryBuilder = Job.find(query);

    // Apply sorting
    if (sort === "newest") {
      queryBuilder = queryBuilder.sort({ createdAt: -1 });
    } else if (sort === "oldest") {
      queryBuilder = queryBuilder.sort({ createdAt: 1 });
    } else if (sort === "attempts") {
      queryBuilder = queryBuilder.sort({ attempts: -1 });
    } else {
      return res.status(400).json({ error: `Unknown sort mode: '${sort}'` });
    }

    // Apply limit
    if (limit) {
      const parsedLimit = parseInt(limit, 10);
      if (!isNaN(parsedLimit) && parsedLimit > 0) {
        queryBuilder = queryBuilder.limit(parsedLimit);
      }
    }

    const jobs = await queryBuilder;

    // Map to API response shape matching list_jobs rows
    const rows = jobs.map((j) => ({
      id: j._id,
      state: j.state,
      attempts: j.attempts,
      max_retries: j.maxRetries,
      priority: j.priority,
      worker_id: j.workerId,
      created_at: j.createdAt.toISOString(),
      next_retry_at: j.nextRetryAt ? j.nextRetryAt.toISOString() : null,
      exit_code: j.exitCode,
    }));

    res.status(200).json(rows);
  } catch (error) {
    next(error);
  }
};

export const showJob = async (req, res, next) => {
  try {
    const { id } = req.params;
    const job = await Job.findById(id);

    if (!job) {
      return res.status(404).json({ error: `No job with id '${id}'` });
    }

    const history = await JobAttempt.find({ jobId: id }).sort({ attemptNumber: 1 });

    // Format response
    res.status(200).json({
      job: {
        id: job._id,
        command: job.command,
        isShell: job.isShell,
        state: job.state,
        attempts: job.attempts,
        maxRetries: job.maxRetries,
        priority: job.priority,
        runAt: job.runAt,
        nextRetryAt: job.nextRetryAt,
        timeoutSeconds: job.timeoutSeconds,
        workerId: job.workerId,
        lockedAt: job.lockedAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        exitCode: job.exitCode,
        stdout: job.stdout,
        stderr: job.stderr,
        lastError: job.lastError,
        executionDurationMs: job.executionDurationMs,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      },
      history: history.map((a) => ({
        attempt_number: a.attemptNumber,
        worker_id: a.workerId,
        started_at: a.startedAt.toISOString(),
        finished_at: a.finishedAt ? a.finishedAt.toISOString() : null,
        exit_code: a.exitCode,
        duration_ms: a.durationMs,
        error: a.error,
        stdout: a.stdout,
        stderr: a.stderr,
      })),
    });
  } catch (error) {
    next(error);
  }
};

export const getCounts = async (req, res, next) => {
  try {
    const counts = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      dead: 0,
    };

    const aggregates = await Job.aggregate([
      { $group: { _id: "$state", count: { $sum: 1 } } },
    ]);

    for (const group of aggregates) {
      if (group._id in counts) {
        counts[group._id] = group.count;
      }
    }

    const now = new Date();
    const totalJobs = await Job.countDocuments();
    const delayed = await Job.countDocuments({ runAt: { $gt: now } });
    const waitingRetry = await Job.countDocuments({
      state: "failed",
      nextRetryAt: { $gt: now },
    });

    const readyJobs = await Job.countDocuments({
      state: { $in: ["pending", "failed"] },
      $and: [
        { $or: [{ runAt: { $exists: false } }, { runAt: null }, { runAt: { $lte: now } }] },
        { $or: [{ nextRetryAt: { $exists: false } }, { nextRetryAt: null }, { nextRetryAt: { $lte: now } }] },
      ],
    });

    res.status(200).json({
      counts,
      total: totalJobs,
      ready: readyJobs,
      delayed,
      waitingRetry,
    });
  } catch (error) {
    next(error);
  }
};
