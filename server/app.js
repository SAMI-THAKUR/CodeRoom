import express from "express";
import session from "express-session";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/authRoutes.js";
import roomRoutes from "./routes/roomRoutes.js";
import passport from "passport";
import configurePassport from "./passportConfig.js";
import CodeRoom from "./CodeRoom.js";
import { PrismaClient } from "@prisma/client";
import cookieParser from "cookie-parser";
import MongoStore from "connect-mongo"; // Import connect-mongo
import mongoose from "mongoose"; // Import mongoose to connect to MongoDB

// Initialize Prisma Client
const prisma = new PrismaClient();

// Config //
dotenv.config();
configurePassport();
const app = express();

// Connect to MongoDB with Mongoose
mongoose
  .connect(process.env.DATABASE_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("Connected to MongoDB");
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
  });

// Set up session middleware with MongoStore
app.use(
  session({
    secret: process.env.SECRET_KEY,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.DATABASE_URL,
      collectionName: "sessions",
    }),
    cookie: {
      secure: false, // Set to true if using HTTPS
      maxAge: 24 * 60 * 60 * 1000 * 5, // Cookie expires after 24 hours
    },
  }),
);

// Middleware //
app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(passport.initialize());
app.use(passport.session());

// ROUTES //
app.use("/auth", authRoutes);
app.use("/room", roomRoutes);

app.get("/", (req, res) => {
  res.send("Hello World");
});

// Connect to MongoDB via Prisma
prisma
  .$connect()
  .then(() => {
    console.log("Prisma connected to the database");
    const server = app.listen(process.env.PORT, () => {
      console.log(`Server is running on port ${process.env.PORT}`);
    });
    CodeRoom(server);
  })
  .catch((err) => console.log(err));
