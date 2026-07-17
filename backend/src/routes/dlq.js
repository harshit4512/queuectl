import express from "express";
import { dlqList, dlqRetry, dlqPurge } from "../controllers/dlqController.js";
import { authGuard } from "../middleware/authGuard.js";

const router = express.Router();

router.use(authGuard);

router.get("/", dlqList);
router.post("/:id/retry", dlqRetry);
router.delete("/", dlqPurge);

export default router;
