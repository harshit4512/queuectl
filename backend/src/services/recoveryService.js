import Job from "../models/Job.js";
import JobAttempt from "../models/JobAttempt.js";
import { decideRetry } from "./retryService.js";

export async function recoverStaleJobs(jobLockTimeoutSeconds, backoffBase) {
  const cutoffTime = new Date(Date.now() - jobLockTimeoutSeconds * 1000);

  // Find processing jobs that were locked before the cutoff time
  const staleJobs = await Job.find({
    state: "processing",
    lockedAt: { $ne: null, $lt: cutoffTime },
  });

  const recovered = [];

  for (const job of staleJobs) {
    const reason = `job abandoned: worker '${job.workerId}' lock at ${job.lockedAt.toISOString()} exceeded the configured job-lock timeout`;

    // Decide if we should retry this job
    const decision = decideRetry(job.attempts, job.maxRetries, backoffBase);

    // Record the failed attempt
    const attempt = new JobAttempt({
      jobId: job._id,
      attemptNumber: job.attempts,
      workerId: job.workerId,
      startedAt: job.startedAt || job.lockedAt || new Date(),
      finishedAt: new Date(),
      exitCode: null,
      stdout: job.stdout || "",
      stderr: job.stderr || "",
      error: reason,
      durationMs: null,
    });
    await attempt.save();

    // Update job status
    job.state = decision.shouldRetry ? "failed" : "dead";
    job.nextRetryAt = decision.nextRetryAt;
    job.lastError = reason;
    job.workerId = null;
    job.lockedAt = null;
    job.updatedAt = new Date();
    await job.save();

    recovered.push({
      jobId: job._id,
      movedToDead: !decision.shouldRetry,
      nextRetryAtSet: decision.shouldRetry,
    });
  }

  return recovered;
}
