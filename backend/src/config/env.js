import dotenv from "dotenv";
import { z } from "zod";
import path from "path";
import os from "os";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(5000),
  MONGODB_URI: z.string().default("mongodb://127.0.0.1:27017/queuectl"),
  JWT_SECRET: z.string().default("queuectl_super_jwt_secret_key_123"),
  JWT_REFRESH_SECRET: z.string().default("queuectl_super_jwt_refresh_secret_key_456"),
  QUEUECTL_DATA_DIR: z.string().transform((val) => {
    if (val) {
      return path.resolve(val.replace(/^~/, os.homedir()));
    }
    return path.join(os.homedir(), ".queuectl");
  }).default(""),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development")
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:", parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;

export const databaseUrl = env.MONGODB_URI;
export const databasePath = env.QUEUECTL_DATA_DIR;
export const logDir = path.join(env.QUEUECTL_DATA_DIR, "logs");
export const supervisorPidPath = path.join(env.QUEUECTL_DATA_DIR, "supervisor.json");
export const workerLogDir = path.join(env.QUEUECTL_DATA_DIR, "logs");
