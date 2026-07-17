import express from "express";
import {
  listWorkers,
  startSupervisor,
  stopSupervisor,
  getSupervisorStatus,
} from "../controllers/workerController.js";
import { authGuard } from "../middleware/authGuard.js";

const router = express.Router();

router.use(authGuard);

router.get("/", listWorkers);
router.get("/supervisor", getSupervisorStatus);
router.post("/supervisor/start", startSupervisor);
router.post("/supervisor/stop", stopSupervisor);

export default router;
