import Job from "../models/Job.js";

export const dlqList = async (req, res, next) => {
  try {
    const deadJobs = await Job.find({ state: "dead" }).sort({ updatedAt: -1 });

    const rows = deadJobs.map((j) => ({
      id: j._id,
      attempts: j.attempts,
      last_error: j.lastError || "-",
      updated_at: j.updatedAt.toISOString(),
    }));

    res.status(200).json(rows);
  } catch (error) {
    next(error);
  }
};

export const dlqRetry = async (req, res, next) => {
  try {
    const { id } = req.params;
    const job = await Job.findById(id);

    if (!job) {
      return res.status(404).json({ error: `No job with id '${id}'` });
    }

    if (job.state !== "dead") {
      return res.status(400).json({
        error: `Job '${id}' is not dead (current state: ${job.state}); only dead jobs can be DLQ-retried`,
      });
    }

    // State transition DLQ Retry: dead -> pending
    job.state = "pending";
    job.workerId = null;
    job.lockedAt = null;
    job.nextRetryAt = null;
    job.exitCode = null;
    job.completedAt = null;
    job.lastError = null;
    job.updatedAt = new Date();

    await job.save();

    res.status(200).json({
      message: `Job '${id}' moved back to pending.`,
      job: {
        id: job._id,
        state: job.state,
        attempts: job.attempts,
        updatedAt: job.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const dlqPurge = async (req, res, next) => {
  try {
    const result = await Job.deleteMany({ state: "dead" });
    res.status(200).json({ purgedCount: result.deletedCount });
  } catch (error) {
    next(error);
  }
};
