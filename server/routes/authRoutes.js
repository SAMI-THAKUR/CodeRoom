import express from "express";
import { auth, signup, login, logout, googleAuth, googleAuthCallback } from "../controller/authController.js";

const router = express.Router();

router.get("/retrieve", auth);
router.post("/signup", signup);
router.post("/login", login);
router.get("/logout", logout);
router.get("/google", googleAuth);
router.get("/google/callback", googleAuthCallback);

export default router;
