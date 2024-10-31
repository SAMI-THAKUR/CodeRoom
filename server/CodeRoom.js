import { WebSocketServer } from "ws";
import ShareDB from "sharedb";
import ShareDBMongo from "sharedb-mongo";
import { PrismaClient } from "@prisma/client";
import { Server } from "socket.io";
import dotenv from "dotenv";
import WebSocketJSONStream from "websocket-json-stream";

dotenv.config();

// Initialize ShareDB with MongoDB for database persistence
const db = new ShareDB({
  db: new ShareDBMongo(process.env.DATABASE_URL),
});

// Initialize Prisma for database operations
const prisma = new PrismaClient();

// Main function for managing code room interactions
const CodeRoom = (server) => {
  // WebSocket and Socket.io server setup
  const wsServer = new WebSocketServer({ noServer: true });
  const io = new Server(server, {
    cors: {
      origin: "http://127.0.0.1:5500",
      methods: ["GET", "POST"],
      allowedHeaders: ["Content-Type"],
      credentials: true,
    },
  });

  // Maps for storing user connections and room data
  const userSocketMap = new Map();
  const roomConnections = new Map();
  const connection = db.connect();

  // Handle WebSocket connections for ShareDB
  wsServer.on("connection", (ws) => {
    const stream = new WebSocketJSONStream(ws);
    db.listen(stream);
  });

  // Upgrade HTTP requests to WebSocket
  server.on("upgrade", (request, socket, head) => {
    wsServer.handleUpgrade(request, socket, head, (ws) => {
      wsServer.emit("connection", ws, request);
    });
  });

  // Socket.io connection management
  io.on("connection", (socket) => {
    // Function to authorize user access to a room
    const authorizeUser = async (roomId, userId) => {
      try {
        const room = await prisma.room.findUnique({
          where: { id: roomId },
        });

        // Check if the user has necessary permissions
        return (
          room.owner === userId ||
          room.accessType === "PUBLIC" ||
          room.viewers.includes(userId) ||
          room.editors.includes(userId) ||
          room.modifiers.includes(userId)
        );
      } catch (error) {
        socket.emit("error", { type: "AUTH_ERROR", message: "Authorization error" });
        return false;
      }
    };

    // Function to check if a user has edit access to a room
    const hasEditAccess = async (roomId, userId) => {
      const room = await prisma.room.findUnique({
        where: { id: roomId },
      });
      return room.accessType === "PUBLIC" || room.owner === userId || room.editors.includes(userId) || room.modifiers.includes(userId);
    };

    // Handle join room request
    socket.on("join_room", async ({ roomId, user }) => {
      try {
        if (!roomId || !user) {
          throw new Error("Invalid room or user data");
        }

        const isAuthorized = await authorizeUser(roomId, user.id);
        if (!isAuthorized) {
          socket.emit("error", { type: "AUTH_ERROR", message: "Not authorized" });
          return;
        }

        // Join the room and set up user mapping
        socket.join(roomId);
        userSocketMap.set(socket.id, user);

        const roomData = await prisma.room.findUnique({
          where: { id: roomId },
        });

        if (!roomData) {
          socket.emit("error", { type: "ROOM_ERROR", message: "Room not found" });
          return;
        }

        // Get the ShareDB document associated with the room
        const doc = connection.get("room", roomId);

        // Fetch and subscribe to the document for real-time updates
        doc.fetch((err) => {
          if (err) {
            socket.emit("error", { type: "DOC_ERROR", message: "Error fetching document" });
            return;
          }

          if (doc.type === null) {
            socket.emit("error", { type: "DOC_ERROR", message: "Document type not found" });
            return;
          } else {
            subscribeToDoc(doc);
          }
        });

        // Function to subscribe to the document for live updates
        function subscribeToDoc(doc) {
          doc.subscribe((error) => {
            if (error) {
              socket.emit("error", { type: "DOC_ERROR", message: "Error subscribing to document" });
              return;
            }

            // Send the initial document content to the client
            socket.emit("initial_content", {
              content: doc.data.content || "",
              title: doc.data.title || "Untitled",
            });

            // Notify other users in the room of the new user's entry
            socket.broadcast.to(roomId).emit("user_joined", {
              roomId,
              user,
              timestamp: Date.now(),
            });

            // Store the connection and document for the room
            roomConnections.set(socket.id, { connection, doc });
          });
        }

        // Listen for incoming operations (document changes)
        doc.on("op", (op, source) => {
          if (source !== socket.id) {
            // Broadcast document updates to all users except the source
            const newContent = op[0]?.oi;
            if (newContent !== undefined) {
              socket.to(roomId).emit("update", { content: newContent });
            }
          }
        });

        // Handle document content update requests
        socket.on("update", async (data) => {
          const content = data;

          const connectionData = roomConnections.get(socket.id);
          if (!connectionData || !connectionData.doc) {
            socket.emit("error", { type: "DOC_ERROR", message: "Document not found" });
            return;
          }

          const canEdit = await hasEditAccess(roomId, user.id);
          if (!canEdit) {
            socket.emit("error", { type: "ACCESS_ERROR", message: "No permission to edit" });
            return;
          }

          const { doc } = connectionData;

          // Submit the operation to ShareDB to update document content
          doc.submitOp([{ p: ["content"], oi: content }], { source: socket.id }, (error) => {
            if (error) {
              socket.emit("error", { type: "OP_ERROR", message: "Failed to apply operation" });
              return;
            }
          });
        });
      } catch (error) {
        socket.emit("error", { type: "JOIN_ERROR", message: "Failed to join room" });
      }
    });

    // Handle user disconnection
    socket.on("disconnect", () => {
      const connectionData = roomConnections.get(socket.id);
      if (connectionData) {
        const { doc } = connectionData;
        if (doc) {
          doc.unsubscribe();
        }
      }
      roomConnections.delete(socket.id);

      const user = userSocketMap.get(socket.id);
      userSocketMap.delete(socket.id);

      // Notify other users in each room of the disconnection
      socket.rooms.forEach((roomId) => {
        socket.to(roomId).emit("user_left", { userId: user?.id, timestamp: Date.now() });
      });
    });
  });

  return { wsServer, io };
};

export default CodeRoom;
