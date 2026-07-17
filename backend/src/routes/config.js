import express from "express";
import { listConfig, getConfig, setConfig, resetConfig } from "../controllers/configController.js";
import { authGuard } from "../middleware/authGuard.js";

const router = express.Router();

router.use(authGuard);

router.get("/", listConfig);
router.get("/:key", getConfig);
router.put("/:key", setConfig);
router.post("/reset", resetConfig);

export default router;
