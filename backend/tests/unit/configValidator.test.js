import { validateConfigValue, cliKeyToInternal, internalKeyToCli } from "../../src/controllers/configController.js";

describe("configController validators", () => {
  describe("cliKeyToInternal / internalKeyToCli", () => {
    test("hyphenated -> snake_case", () => {
      expect(cliKeyToInternal("max-retries")).toBe("max_retries");
      expect(cliKeyToInternal("backoff-base")).toBe("backoff_base");
    });

    test("snake_case -> hyphenated", () => {
      expect(internalKeyToCli("max_retries")).toBe("max-retries");
      expect(internalKeyToCli("worker_poll_interval")).toBe("worker-poll-interval");
    });
  });

  describe("validateConfigValue", () => {
    test("max_retries accepts 0", () => {
      expect(validateConfigValue("max_retries", "0")).toBe("0");
    });

    test("max_retries accepts positive integers", () => {
      expect(validateConfigValue("max_retries", "5")).toBe("5");
    });

    test("max_retries rejects float", () => {
      expect(() => validateConfigValue("max_retries", "3.5")).toThrow();
    });

    test("max_retries rejects negative", () => {
      expect(() => validateConfigValue("max_retries", "-1")).toThrow();
    });

    test("backoff_base accepts 1.0 (min inclusive)", () => {
      expect(validateConfigValue("backoff_base", "1.0")).toBe("1");
    });

    test("backoff_base accepts > 1", () => {
      expect(validateConfigValue("backoff_base", "2")).toBe("2");
    });

    test("backoff_base rejects < 1", () => {
      expect(() => validateConfigValue("backoff_base", "0.5")).toThrow();
    });

    test("worker_poll_interval rejects 0 (exclusive minimum)", () => {
      expect(() => validateConfigValue("worker_poll_interval", "0")).toThrow();
    });

    test("worker_poll_interval accepts > 0", () => {
      expect(validateConfigValue("worker_poll_interval", "0.5")).toBe("0.5");
    });

    test("unknown key throws", () => {
      expect(() => validateConfigValue("unknown_key", "1")).toThrow("Unknown configuration key");
    });

    test("non-numeric value throws", () => {
      expect(() => validateConfigValue("max_retries", "abc")).toThrow();
    });
  });
});
