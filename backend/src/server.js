import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";

import { env } from "./config/env.js";
import { connectDB } from "./config/db.js";
import { errorHandler } from "./middleware/errorHandler.js";
import logger from "./utils/logger.js";
import ConfigEntry from "./models/ConfigEntry.js";
import User from "./models/User.js";

// Routes imports
import authRoutes from "./routes/auth.js";
import jobRoutes from "./routes/jobs.js";
import dlqRoutes from "./routes/dlq.js";
import configRoutes from "./routes/config.js";
import workerRoutes from "./routes/workers.js";

import {
  DEFAULT_MAX_RETRIES,
  DEFAULT_BACKOFF_BASE,
  DEFAULT_WORKER_POLL_INTERVAL,
  DEFAULT_WORKER_HEARTBEAT_INTERVAL,
  DEFAULT_WORKER_STALE_TIMEOUT,
  DEFAULT_JOB_LOCK_TIMEOUT,
  DEFAULT_SHUTDOWN_TIMEOUT,
  DEFAULT_JOB_TIMEOUT,
} from "./config/constants.js";

const DEFAULTS = {
  max_retries: String(DEFAULT_MAX_RETRIES),
  backoff_base: String(DEFAULT_BACKOFF_BASE),
  worker_poll_interval: String(DEFAULT_WORKER_POLL_INTERVAL),
  worker_heartbeat_interval: String(DEFAULT_WORKER_HEARTBEAT_INTERVAL),
  worker_stale_timeout: String(DEFAULT_WORKER_STALE_TIMEOUT),
  job_lock_timeout: String(DEFAULT_JOB_LOCK_TIMEOUT),
  shutdown_timeout: String(DEFAULT_SHUTDOWN_TIMEOUT),
  default_job_timeout: String(DEFAULT_JOB_TIMEOUT),
};

// Seed defaults and initial admin user
async function bootstrapDB() {
  try {
    // 1. Seed Config Defaults
    for (const [key, value] of Object.entries(DEFAULTS)) {
      const exists = await ConfigEntry.findById(key);
      if (!exists) {
        await ConfigEntry.create({ _id: key, value });
      }
    }
    console.log("✅ Configuration defaults verified/seeded.");

    // 2. Seed Default Admin User
    const adminExists = await User.findOne({ username: "admin" });
    if (!adminExists) {
      await User.create({
        username: "admin",
        passwordHash: "admin123", // Will be hashed automatically by User model pre-save hook
        role: "admin",
      });
      console.log("👤 Default Admin User Seeded: username='admin', password='admin123'");
    }
  } catch (err) {
    console.error("❌ DB Bootstrap failed:", err.message);
  }
}

const app = express();

// Middlewares
app.use(helmet());
app.use(
  cors({
    origin: true, // Allow all origins for dev simplicity, or specify client port
    credentials: true,
  })
);
app.use(morgan("dev"));
app.use(express.json());
app.use(cookieParser());

// Healthcheck Route
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", timestamp: new Date() });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/dlq", dlqRoutes);
app.use("/api/config", configRoutes);
app.use("/api/workers", workerRoutes);

// Error Handler Middleware
app.use(errorHandler);

// Connect DB & Start Server
const startServer = async () => {
  await connectDB();
  await bootstrapDB();

  const port = env.PORT;
  app.listen(port, () => {
    logger.info(`🚀 Server running in ${env.NODE_ENV} mode on port ${port}`);
  });
};

startServer().catch((err) => {
  console.error("Failed to start Express server:", err);
  process.exit(1);
});

export default app; // Export for testing
