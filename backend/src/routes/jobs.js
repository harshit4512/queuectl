import express from "express";
import { z } from "zod";
import { enqueue, listJobs, showJob, getCounts } from "../controllers/jobController.js";
import { validate } from "../middleware/validator.js";
import { authGuard } from "../middleware/authGuard.js";

const router = express.Router();

const enqueueSchema = z.object({
  id: z
    .string()
    .min(1, "Job ID must not be empty")
    .max(128, "Job ID must be less than 128 characters")
    .regex(/^[A-Za-z0-9_\-]+$/, "Job ID must contain only letters, digits, underscores, and hyphens"),
  command: z.union([z.string(), z.array(z.string())]),
  max_retries: z.number().int().min(0).default(3),
  timeout: z.number().int().min(1).nullable().optional(),
  priority: z.number().int().default(0),
  run_at: z.string().datetime({ precision: 3 }).nullable().optional(),
  shell: z.boolean().default(false),
});

const querySchema = z.object({
  state: z.enum(["pending", "processing", "completed", "failed", "dead"]).optional(),
  sort: z.enum(["newest", "oldest", "attempts"]).default("newest"),
  limit: z.coerce.number().int().min(1).optional(),
});

router.use(authGuard);

router.post("/", validate(enqueueSchema), enqueue);
router.get("/", validate(querySchema, "query"), listJobs);
router.get("/stats/counts", getCounts);
router.get("/:id", showJob);

export default router;
