import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import ShareDB from "sharedb";
import ShareDBMongo from "sharedb-mongo";
import dotenv from "dotenv";
import { ObjectId } from "mongodb";
dotenv.config();

const prisma = new PrismaClient();

// Setup ShareDB connection (this should ideally be done outside of the request handler)
const backend = new ShareDB({
  db: new ShareDBMongo(process.env.DATABASE_URL),
});
const connection = backend.connect();

const createroom = async (req, res) => {
  let { title } = req.body;
  const userId = req.userId;
  const date = new Date();
  if (!userId) {
    return res.status(400).json({ error: "Sign in to create a room" });
  }
  if (!title) {
    title = `Untitled room ${date.toLocaleDateString()}`;
  }
  const id = crypto.randomUUID(); // Use UUID directly without removing dashes

  // Create a new ShareDB document for the room
  const doc = connection.get("room", id); // 'rooms' is the collection name
  doc.create(
    {
      owner: new ObjectId(userId),
      title,
      accessType: "PRIVATE",
      viewers: [],
      editors: [],
      modifiers: [],
    },
    (err) => {
      if (err) {
        return res.status(500).json({ error: "Failed to create room in ShareDB", details: err });
      }
    },
  );
  const room = await prisma.room.findUnique({
    where: { id },
  });
  res.status(201).json({ message: "Room created successfully", room });
};

const getroom = async (req, res) => {
  const roomId = req.params.roomId;
  const userId = req.userId;
  const room = await prisma.room.findUnique({
    where: { id: roomId },
  });
  if (!room) {
    return res.status(404).json({ error: "room not found" });
  }
  if (
    room.owner === userId ||
    room.accessType === "PUBLIC" ||
    room.viewers.includes(userId) ||
    room.editors.includes(userId) ||
    room.modifiers.includes(userId)
  ) {
    res.status(200).json({ message: "room loaded successfully", room });
  } else {
    res.status(403).json({ error: "You are not authorized to access this room" });
  }
};

const updateAccessType = async (req, res) => {
  const roomId = req.params.roomId;
  const { accessType } = req.body;
  const userId = req.userId;
  console.log(userId);
  const room = await prisma.room.findUnique({
    where: { id: roomId },
  });
  console.log(room.owner === userId);
  if (!room) {
    return res.status(404).json({ error: "room not found" });
  }
  if (room.owner !== userId && !room.modifiers.includes(userId)) {
    return res.status(403).json({ error: "You are not authorized to update this room" });
  }
  const updatedroom = await prisma.room.update({
    where: { id: roomId },
    data: { accessType },
  });
  res.status(200).json({ message: "room updated successfully", room: updatedroom });
};

const addAccess = async (req, res) => {
  const roomId = req.params.roomId;
  const { accesses } = req.body;
  const userId = req.userId;
  const room = await prisma.room.findUnique({
    where: { id: roomId },
  });
  if (!room) {
    return res.status(404).json({ error: "room not found" });
  }
  if (room.owner !== userId && !room.modifiers.includes(userId)) {
    return res.status(403).json({ error: "You are not authorized to update this room" });
  }
  for (const access of accesses) {
    if (access.type === "VIEWER") {
      room.viewers.push(access.userId);
    } else if (access.type === "EDITOR") {
      room.editors.push(access.userId);
    } else if (access.type === "MODIFIER") {
      room.modifiers.push(access.userId);
    }
  }
  const updatedroom = await prisma.room.update({
    where: { id: roomId },
    data: {
      viewers: room.viewers,
      editors: room.editors,
      modifiers: room.modifiers,
    },
  });
  res.status(200).json({ message: "room updated successfully", room: updatedroom });
};

const deleteroom = async (req, res) => {
  const roomId = req.params.roomId;
  const userId = req.userId;
  const room = await prisma.room.findUnique({
    where: { id: roomId },
  });
  if (!room) {
    return res.status(404).json({ error: "room not found" });
  }
  if (room.owner !== userId || !room.modifiers.includes(userId)) {
    return res.status(403).json({ error: "You are not authorized to delete this room" });
  }
  await prisma.room.delete({
    where: { id: roomId },
  });
  res.status(200).json({ message: "room deleted successfully" });
};

export { createroom, getroom, updateAccessType, addAccess, deleteroom };
