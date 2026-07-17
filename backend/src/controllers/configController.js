import ConfigEntry from "../models/ConfigEntry.js";
import { CONFIG_KEYS } from "../config/constants.js";

const VALIDATORS = {
  // key: [minimum, is_inclusive, is_int]
  max_retries: [0, true, true],
  backoff_base: [1.0, true, false],
  worker_poll_interval: [0.0, false, false],
  worker_heartbeat_interval: [0.0, false, false],
  worker_stale_timeout: [0.0, false, false],
  job_lock_timeout: [0.0, false, false],
  shutdown_timeout: [0.0, false, false],
  default_job_timeout: [0.0, false, true],
};

const DEFAULTS = {
  max_retries: "3",
  backoff_base: "2.0",
  worker_poll_interval: "1.0",
  worker_heartbeat_interval: "2.0",
  worker_stale_timeout: "15.0",
  job_lock_timeout: "30.0",
  shutdown_timeout: "30.0",
  default_job_timeout: "300",
};

export const cliKeyToInternal = (key) => key.replace(/-/g, "_");
export const internalKeyToCli = (key) => key.replace(/_/g, "-");

export const validateConfigValue = (internalKey, rawValue) => {
  if (!CONFIG_KEYS.includes(internalKey)) {
    const validKeysStr = CONFIG_KEYS.map(internalKeyToCli).sort().join(", ");
    throw new Error(`Unknown configuration key '${internalKeyToCli(internalKey)}'. Valid keys: ${validKeysStr}`);
  }

  const [min, inclusive, isInt] = VALIDATORS[internalKey];

  let parsed;
  if (isInt) {
    parsed = parseInt(rawValue, 10);
    if (isNaN(parsed) || String(parsed) !== String(rawValue)) {
      throw new Error(`Invalid value '${rawValue}' for '${internalKeyToCli(internalKey)}': expected an integer`);
    }
  } else {
    parsed = parseFloat(rawValue);
    if (isNaN(parsed)) {
      throw new Error(`Invalid value '${rawValue}' for '${internalKeyToCli(internalKey)}': expected a number`);
    }
  }

  const ok = inclusive ? parsed >= min : parsed > min;
  if (!ok) {
    const comp = inclusive ? ">=" : ">";
    throw new Error(`'${internalKeyToCli(internalKey)}' must be ${comp} ${min}, got ${parsed}`);
  }

  return String(parsed);
};

export const listConfig = async (req, res, next) => {
  try {
    const entries = await ConfigEntry.find({});
    const values = {};

    // Seed any missing defaults
    for (const key of CONFIG_KEYS) {
      const found = entries.find((e) => e._id === key);
      const val = found ? found.value : DEFAULTS[key];
      values[internalKeyToCli(key)] = val;
    }

    res.status(200).json(values);
  } catch (error) {
    next(error);
  }
};

export const getConfig = async (req, res, next) => {
  try {
    const cliKey = req.params.key;
    const internalKey = cliKeyToInternal(cliKey);

    if (!CONFIG_KEYS.includes(internalKey)) {
      return res.status(404).json({ error: `Unknown configuration key '${cliKey}'` });
    }

    let entry = await ConfigEntry.findById(internalKey);
    const value = entry ? entry.value : DEFAULTS[internalKey];

    res.status(200).json({ key: cliKey, value });
  } catch (error) {
    next(error);
  }
};

export const setConfig = async (req, res, next) => {
  try {
    const cliKey = req.params.key;
    const { value: rawValue } = req.body;
    const internalKey = cliKeyToInternal(cliKey);

    if (rawValue === undefined || rawValue === null) {
      return res.status(400).json({ error: "Missing config value" });
    }

    let canonical;
    try {
      canonical = validateConfigValue(internalKey, String(rawValue));
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    await ConfigEntry.findOneAndUpdate(
      { _id: internalKey },
      { value: canonical, updatedAt: new Date() },
      { upsert: true, new: true }
    );

    res.status(200).json({ key: cliKey, value: canonical });
  } catch (error) {
    next(error);
  }
};

export const resetConfig = async (req, res, next) => {
  try {
    for (const [key, value] of Object.entries(DEFAULTS)) {
      await ConfigEntry.findOneAndUpdate(
        { _id: key },
        { value, updatedAt: new Date() },
        { upsert: true }
      );
    }
    res.status(200).json({ message: "Configuration reset to defaults." });
  } catch (error) {
    next(error);
  }
};
