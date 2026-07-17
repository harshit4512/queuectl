// Configuration defaults (persisted into the config table on first init)
export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_BACKOFF_BASE = 2.0;
export const DEFAULT_WORKER_POLL_INTERVAL = 1.0;
export const DEFAULT_WORKER_HEARTBEAT_INTERVAL = 2.0;
export const DEFAULT_WORKER_STALE_TIMEOUT = 15.0;
export const DEFAULT_JOB_LOCK_TIMEOUT = 30.0;
export const DEFAULT_SHUTDOWN_TIMEOUT = 30.0;
export const DEFAULT_JOB_TIMEOUT = 300;

// Validation limits
export const MAX_COMMAND_LENGTH = 4096;
export const MAX_JOB_ID_LENGTH = 128;
export const JOB_ID_PATTERN = /^[A-Za-z0-9_\-]+$/;
export const MAX_OUTPUT_BYTES = 1000000; // 1 MB per stream, then truncate

// Config table keys
export const CONFIG_KEYS = [
  "max_retries",
  "backoff_base",
  "worker_poll_interval",
  "worker_heartbeat_interval",
  "worker_stale_timeout",
  "job_lock_timeout",
  "shutdown_timeout",
  "default_job_timeout"
];

// Runtime settings
export const DEFAULT_DATA_DIR_NAME = ".queuectl";
export const SUPERVISOR_PID_FILENAME = "supervisor.json";
export const LOG_DIR_NAME = "logs";
export const DB_SEED_USER = "admin";
