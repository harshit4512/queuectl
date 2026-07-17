import express from "express";
import { z } from "zod";
import { register, login, refresh, logout, me } from "../controllers/authController.js";
import { validate } from "../middleware/validator.js";
import { authGuard } from "../middleware/authGuard.js";

const router = express.Router();

const authSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be less than 30 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Username must contain only letters, digits, and underscores"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

router.post("/register", validate(authSchema), register);
router.post("/login", validate(authSchema), login);
router.post("/refresh", refresh);
router.post("/logout", authGuard, logout);
router.get("/me", authGuard, me);

export default router;
