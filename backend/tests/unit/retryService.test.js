import { computeBackoffDelay, decideRetry } from "../../src/services/retryService.js";

describe("retryService", () => {
  describe("computeBackoffDelay", () => {
    test("base=2, retry #1 -> 2 seconds", () => {
      expect(computeBackoffDelay(1, 2)).toBe(2);
    });

    test("base=2, retry #2 -> 4 seconds", () => {
      expect(computeBackoffDelay(2, 2)).toBe(4);
    });

    test("base=2, retry #3 -> 8 seconds", () => {
      expect(computeBackoffDelay(3, 2)).toBe(8);
    });

    test("base=3, retry #2 -> 9 seconds", () => {
      expect(computeBackoffDelay(2, 3)).toBe(9);
    });

    test("throws if retryNumber < 1", () => {
      expect(() => computeBackoffDelay(0, 2)).toThrow("retryNumber must be >= 1");
    });
  });

  describe("decideRetry", () => {
    test("should retry when attempts < 1 + maxRetries", () => {
      const decision = decideRetry(1, 3, 2.0); // max 4 total executions, only 1 used
      expect(decision.shouldRetry).toBe(true);
      expect(decision.nextRetryAt).toBeInstanceOf(Date);
      expect(decision.delaySeconds).toBe(2); // 2^1
    });

    test("should NOT retry when attempts >= 1 + maxRetries (exhausted)", () => {
      const decision = decideRetry(4, 3, 2.0); // 4 attempts >= 1+3=4 total
      expect(decision.shouldRetry).toBe(false);
      expect(decision.nextRetryAt).toBeNull();
      expect(decision.delaySeconds).toBeNull();
    });

    test("maxRetries=0 means no retries at all (only 1 execution)", () => {
      const decision = decideRetry(1, 0, 2.0);
      expect(decision.shouldRetry).toBe(false);
    });

    test("retry delay follows exponential formula", () => {
      const decision = decideRetry(3, 5, 2.0); // 3rd attempt, backoff = 2^3 = 8s
      expect(decision.delaySeconds).toBe(8);
    });

    test("nextRetryAt is approximately now + delaySeconds", () => {
      const before = Date.now();
      const decision = decideRetry(1, 3, 2.0);
      const after = Date.now();

      const nextMs = decision.nextRetryAt.getTime();
      // Should be approximately now + 2000ms
      expect(nextMs).toBeGreaterThanOrEqual(before + 1900);
      expect(nextMs).toBeLessThanOrEqual(after + 2100);
    });
  });
});
