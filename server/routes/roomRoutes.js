import express from "express";
import { createroom, getroom, updateAccessType, addAccess, deleteroom } from "../controller/roomController.js";
import auth from "../authMiddleware.js";
const router = express.Router();

router.post("/create", auth, createroom);
router.get("/:roomId", auth, getroom);
router.put("/updateAccessType/:roomId", auth, updateAccessType);
router.put("/addAccess/:roomId", auth, addAccess);
router.delete("/delete/:roomId", auth, deleteroom);

export default router;
