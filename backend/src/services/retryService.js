export function computeBackoffDelay(retryNumber, backoffBase) {
  if (retryNumber < 1) {
    throw new Error(`retryNumber must be >= 1, got ${retryNumber}`);
  }
  return Math.pow(backoffBase, retryNumber);
}

export function decideRetry(attempts, maxRetries, backoffBase) {
  const maxTotalExecutions = 1 + maxRetries;
  if (attempts >= maxTotalExecutions) {
    return {
      shouldRetry: false,
      nextRetryAt: null,
      delaySeconds: null,
    };
  }

  // this failure was attempt number `attempts`; next retry is #attempts+1
  const retryNumber = attempts;
  const delay = computeBackoffDelay(retryNumber, backoffBase);
  const nextRetryAt = new Date(Date.now() + delay * 1000);

  return {
    shouldRetry: true,
    nextRetryAt,
    delaySeconds: delay,
  };
}
